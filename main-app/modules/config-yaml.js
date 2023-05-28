const configYaml = require("config-yaml");

let config;

if (process.env.NODE_ENV === "production") {
	config = configYaml("./config.yaml").production;
} else {
	config = configYaml("./config.yaml").development;
}

if (!Object.keys(config).length) {
	throw "Config file is empty or malformed";
}

module.exports = config;