require("dotenv").config();
const express = require("express");
const uuidv1 = require("uuid/v1");
const axios = require('axios');
const _ = require('lodash');
const {
	ETwitterStreamEvent,
	TwitterApi
} = require('twitter-api-v2');
const NodeCache = require("node-cache");
const fs = require("fs");
const moment = require("moment");

const config = require('./modules/config-yaml');
const logger = require("./modules/logger");
const crisislex = require("./crisislex_25");

const app = express()
const port = 3000
const twitterCache = new NodeCache({
	stdTTL: 10,
	checkperiod: 120
})

const token = config.TWITTER_BEARER_TOKEN;

logger.log('info', "Starting Backend Node.js App......");

// Form Filter Array For CrisisLex
let crisislexStreamFilter = []

for (const term of crisislex) {
	crisislexStreamFilter.push({
		value: "(" + term + " OR #Malaysia OR #malaysia OR \"Malaysia\" OR \"malaysia\" OR place_country:MY) lang:en -is:retweet"
	})
}

console.log("crisislexStreamFilter Final: ")
console.log(crisislexStreamFilter)

function capitalizeFirstCharacter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1)
}

function convertMetersToKM(length) {
	return length / 1000 + " km"
}

const client = new TwitterApi(token);

async function callClassifyAndGeoTagAPIs(tweet) {
	let classificationResult;

	// Call Classify App
	const classifyResponse = await axios.post("http://localhost:5000/api/v1/classify", JSON.stringify({
		tweet: tweet.text
	}), {
		headers: {
			'Content-Type': 'application/json'
		},
		responseType: 'json'
	})

	classificationResult = classifyResponse.data

	tweet.category = classificationResult.category
	tweet.score = classificationResult.score

	if (tweet.category !== "unrelated") {
		// Disaster Detected Flow

		// Call Geolocation App
		let geoparsingResult;

		const geotagResponse = await axios.post(
			"http://localhost:8000/api/v1/geolocation", {
				"tweet": tweet.text
			}, {
				headers: {
					'Content-Type': 'application/json'
				},
				responseType: 'json'
			})

		geoparsingResult = geotagResponse.data

		if (geoparsingResult.result.length > 0) {
			tweet.countryName = geoparsingResult.result[0].country
			tweet.placeName = geoparsingResult.result[0].city ? geoparsingResult.result[0].city : null
			tweet.location = {
				longitude: geoparsingResult.result[0].lon ? geoparsingResult.result[0].lon : null,
				latitude: geoparsingResult.result[0].lat ? geoparsingResult.result[0].lat : null
			};
		} else {
			// No Location Tweets 1
			tweet.countryName = "N/A"

			return tweet
		}

	} else {
		// No Disaster Detected Flow

		// Unrelated Tweets
		tweet.category = "Unrelated"
		tweet.countryName = "N/A"

		return tweet
	}

	if (_.has(tweet, "placeName")) {
		logger.log('info', "Success Tweets!!!")

		return tweet
	} else {
		// No Location Tweets 2
		tweet.countryName = "N/A"

		return tweet
	}
}

async function callGeoapifyPlacesAPIs(tweet) {
	const geioapifyAPIKey = "b9ab5ba9e1144e7db2df2665edd35b06"

	const recommendationRescueResponse = await axios.get(`https://api.geoapify.com/v2/places?categories=service.police,office.government&filter=circle:${tweet.location.longitude},${tweet.location.latitude},2500&bias=proximity:${tweet.location.longitude},${tweet.location.latitude}&lang=en&limit=20&apiKey=${geioapifyAPIKey}`, {
		headers: {
			'Content-Type': 'application/json'
		},
		responseType: 'json'
	})

	let rescueRecommendationList = []

	for (const place of recommendationRescueResponse.data.features) {
		if (!_.find(rescueRecommendationList, {
				name: place.properties.name
			})) {
			rescueRecommendationList.push({
				name: place.properties.name,
				street: place.properties.street,
				suburb: place.properties.suburb,
				district: place.properties.district,
				postcode: place.properties.postcode,
				city: place.properties.city,
				state: place.properties.state,
				lon: place.properties.lon,
				lat: place.properties.lat,
				distance: place.properties.distance,
				categories: place.properties.categories[0] === "building" ? place.properties.categories[2] : place.properties.categories[0]
			})
		} else {
			logger.log('info', "Duplicated Rescue Place Name Detected!")
			logger.log('info', "Place Name: " + place.properties.name)
		}
	}

	tweet.rescue_recommendation_list = rescueRecommendationList

	const recommendationEvacuationResponse = await axios.get(`https://api.geoapify.com/v2/places?categories=healthcare.hospital,education.school,education.college,education.university&filter=circle:${tweet.location.longitude},${tweet.location.latitude},2500&bias=proximity:${tweet.location.longitude},${tweet.location.latitude}&lang=en&limit=20&apiKey=${geioapifyAPIKey}`, {
		headers: {
			'Content-Type': 'application/json'
		},
		responseType: 'json'
	})

	let evacuationRecommendationList = []

	for (const place of recommendationEvacuationResponse.data.features) {
		if (!_.find(evacuationRecommendationList, {
				name: place.properties.name
			})) {
			evacuationRecommendationList.push({
				name: place.properties.name,
				street: place.properties.street,
				suburb: place.properties.suburb,
				district: place.properties.district,
				postcode: place.properties.postcode,
				city: place.properties.city,
				state: place.properties.state,
				lon: place.properties.lon,
				lat: place.properties.lat,
				distance: place.properties.distance,
				categories: place.properties.categories[0]
			})
		} else {
			logger.log('info', "Duplicated Evacuation Place Name Detected!")
			logger.log('info', "Place Name: " + place.properties.name)
		}
	}

	tweet.evacuation_recommendation_list = evacuationRecommendationList

	return tweet
}

async function streamConnect() {
	// Retrieve current rules
	const rules = await client.v2.streamRules();

	// Delete old rules if exist
	if (rules.hasOwnProperty("data")) {
		await client.v2.updateStreamRules({
			delete: {
				ids: rules.data.map(rule => rule.id)
			},
		});
	}

	// Add our rules
	await client.v2.updateStreamRules({
		add: crisislexStreamFilter,
	});

	const stream = await client.v2.searchStream({
		expansions: [
			'referenced_tweets.id',
			'author_id'
		],
		'tweet.fields': [
			'author_id',
			'created_at',
			'geo',
			'text',
			'referenced_tweets'
		],
		'user.fields': [
			'id',
			'created_at',
			'name',
			'username',
			'location'
		]
	});

	// Enable auto reconnect
	stream.autoReconnect = true;

	stream
		.on(ETwitterStreamEvent.Data, async (tweet) => {
			try {
				console.log("Received Tweet:")
				console.log(tweet)

				let resultGetCache = twitterCache.get(tweet.data.id)

				if (resultGetCache == undefined) {
					// logger.log('info', "Get Cache Failed Flow")

					const obj = {
						value: "true"
					}

					// const resultSetCache = twitterCache.set(tweet.data.text, obj, 10)
					const resultSetCache = twitterCache.set(tweet.data.id, obj, 10)

					new_tweet = {
						id: uuidv1(),
						tweet_id: tweet.data.id,
						author_id: tweet.data.author_id,
						created_at: tweet.data.created_at,
						text: tweet.data.text
					}

					const classified_geotag_tweet = await callClassifyAndGeoTagAPIs(new_tweet)

					// Temporary Disabled For Saving Tweet Data
					if (
						classified_geotag_tweet.category !== "Unrelated" && 
						classified_geotag_tweet.category !== "No Location") 
					{
						const recommendation_classified_geotag_tweet = await callGeoapifyPlacesAPIs(classified_geotag_tweet)

						const finalTweetData = recommendation_classified_geotag_tweet

						if (finalTweetData !== undefined) {
							if (_.has(finalTweetData, "placeName")) {
								logger.log('info', "Detected Disaster Tweets: ")
								logger.log('info', finalTweetData)

								let stateName

								// Part 2 - Rescue Recommendation List
								let rescueRecommendationMessages = "\n\n*********RECOMMENDATION*********\nList of Nearby Rescue Forces:\n"
								let rescuePlaceIndex = 0

								for (const rescue of finalTweetData.rescue_recommendation_list) {
									stateName = rescue.state

									rescueRecommendationMessages += `(${rescuePlaceIndex + 1}) ${rescue.name}\nAddress: `

									rescueRecommendationMessages = rescueRecommendationMessages + (rescue.street === undefined ? '' : rescue.street) + (rescue.suburb === undefined ? '' : ', ' + rescue.suburb) + (rescue.district === undefined ? '' : ', ' + rescue.district) + (rescue.postcode === undefined ? '' : ', ' + rescue.postcode) + (rescue.city === undefined ? '' : ' ' + rescue.city) + (rescue.state === undefined ? '' : ', ' + rescue.state) + '\n'

									rescueRecommendationMessages = rescueRecommendationMessages + `Distance: ${convertMetersToKM(rescue.distance)}\nLatitude: ${rescue.lat.toFixed(7)}\nLongitude: ${rescue.lon.toFixed(7)}`

									if (rescuePlaceIndex === 4) {
										break
									}

									if (rescuePlaceIndex !== finalTweetData.rescue_recommendation_list) {
										rescueRecommendationMessages += "\n"
									}

									rescuePlaceIndex += 1
								}

								// Part 3 - Evacuation Recommendation List
								let evacuationRecommendationMessages = "\nList of Nearby Evacuation Places:\n"
								let evacuationPlaceIndex = 0

								for (const rescue of finalTweetData.evacuation_recommendation_list) {
									stateName = rescue.state

									evacuationRecommendationMessages += `(${evacuationPlaceIndex + 1}) ${rescue.name}\nAddress: `

									evacuationRecommendationMessages = evacuationRecommendationMessages + (rescue.street === undefined ? '' : rescue.street) + (rescue.suburb === undefined ? '' : ', ' + rescue.suburb) + (rescue.district === undefined ? '' : ', ' + rescue.district) + (rescue.postcode === undefined ? '' : ', ' + rescue.postcode) + (rescue.city === undefined ? '' : ' ' + rescue.city) + (rescue.state === undefined ? '' : ', ' + rescue.state) + '\n'

									evacuationRecommendationMessages = evacuationRecommendationMessages + `Distance: ${convertMetersToKM(rescue.distance)}\nLatitude: ${rescue.lat.toFixed(7)}\nLongitude: ${rescue.lon.toFixed(7)}`

									if (evacuationPlaceIndex === 4) {
										break
									}

									if (evacuationPlaceIndex !== finalTweetData.evacuation_recommendation_list) {
										evacuationRecommendationMessages += "\n"
									}

									evacuationPlaceIndex += 1
								}

								// Part 1 - Report Information
								let reportMessages = `**************REPORT**************\nDisaster Type: ${capitalizeFirstCharacter(finalTweetData.category)}\nLocation: ${finalTweetData.placeName}\n`

								reportMessages = reportMessages + (stateName === undefined ? '' : "State: " + stateName + '\n') + `Latitude: ${finalTweetData.location.latitude}\nLongitude: ${finalTweetData.location.longitude}\n` + `Map Location: https://www.openstreetmap.org/?mlat=${parseFloat(finalTweetData.location.latitude).toFixed(4)}&mlon=${parseFloat(finalTweetData.location.longitude).toFixed(4)}#map=${parseFloat(finalTweetData.location.latitude).toFixed(4)}/${parseFloat(finalTweetData.location.longitude).toFixed(4)}`

								// Part 4 - Response Messages
								let responseMessages = `\n\nKindly analyze and take immediate action as soon as possible.\n\nThank you for your attention!\n\nBest Regards,\nTHU DMS Bot`

								const finalMessages = reportMessages + rescueRecommendationMessages + evacuationRecommendationMessages + responseMessages

								console.log("finalMessages: ")
								console.log(finalMessages)

								const sendTelegramMessageResponse = await axios.post("https://thudms-telegram-api.netlify.app/.netlify/functions/api/v1/send", JSON.stringify({
									messages: finalMessages
								}), {
									headers: {
										'Content-Type': 'application/json'
									},
									responseType: 'json'
								})

								logger.log('info', "Telegram Messages Sent!")
							}

							return recommendation_classified_geotag_tweet
						}
					}
				} else {
					logger.log('info', "Get Cache Success Flow")
					logger.log('info', "Do Nothings!")
				}
			} catch (error) {
				console.error("streamConnect error:")
				console.error(error)
			}
		})

	return stream;
}

// Listen to the stream
streamConnect();

app.listen(port, () => {
	console.log(`Disaster Monitoring System Backend App Listening On Port ${port}.....`)
})