import json
import requests
import string
from flask import Flask, request, abort
from geotext import GeoText

app = Flask(__name__)

@app.route('/api/v1/geolocation', methods=['POST', 'GET'])
def index():
    if request.method == 'GET':
        return 'Welcome to Disaster Geolocation App!'

    if request.method == 'POST':
        if not request.json:
            abort(400)
        tweet = request.json
        
        capitalizedTweet = string.capwords(tweet['tweet'])
        
        # GeoText Method
        resultGeoTextCountry = GeoText(capitalizedTweet).country_mentions
        
        print("resultGeoTextCountry: ")
        print(resultGeoTextCountry)
        
        locationArray = []
        
        for country, count in resultGeoTextCountry.items():                
            # For Detecting Malaysia Countries
            if 'MY' in country:
                resultGeoTextCities = GeoText(capitalizedTweet).cities
                
                for city in resultGeoTextCities:
                    print("city: ")
                    print(city)
                    
                    # Malaysia
                    target_url = f'https://geocode.maps.co/search?city={city}&country=Malaysia'

                    response = requests.get(target_url)

                    # Convert Response Payload To JSON Format
                    responseJSON = response.json()
                    
                    print("responseJSON: ")
                    print(responseJSON)
                    
                    locationArray.append({
                        "city": city,
                        "country": "Malaysia",
                        "lat": responseJSON[0]["lat"],
                        "lon": responseJSON[0]["lon"]
                    })
            else:
                locationArray.append({
                    "country": country
                })
                
        response = app.response_class(
            response=json.dumps({
                "result": locationArray
            }),
            status=200,
            mimetype='application/json'
        )
        
        return response

if __name__ == "__main__":
    # Run App On 0.0.0.0 Port 8000
    app.run(host='0.0.0.0', port=8000)