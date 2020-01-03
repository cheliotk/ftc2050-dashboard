<!-- ![Logo of the project](http://www.path/to/logo.png) -->

# FTC2050 Freight Dashboard

Development of a web-based visualisation dashboard for last-mile urban freight traffic.

## Installation

Clone/Download this repository to get started.
The dashboard requires [node.js](https://nodejs.org/en/) to be installed and a [MongoDB](https://www.mongodb.com/) instance running.

## Usage

To run the dashboard with the sample data, add the [sample datasets](samples/mongoimport) to a MongoDB database using the `mongoimport` command.
Copy the `config-example.json` file and rename to `config.json`. Fill in the fields with the relevant information:

```javascript
// config.json
{
	"MongoDbConfiguration" : {
        // inormation about the MongoDb setup 
		"url" : "mongodb://localhost:27017/",
        	"database" : "the database name",
		"collectionTrips" : "the trip paths collection name",
		"collectionWaypoints" : "the trip waypoints collection name" 
	},
	"ServerConfiguration" : {
        // information about the node.js server app goes here
		"hostname" : "0.0.0.0",
		"port" : 5002
	},
	"queryFilters" : {
        // filters and projection for the mongodb query
		"tripsQuery" : {
			"projection" : {
                		"_id_":false
            		}
		}
	}
}
```
After setting up `config.json`, run the `app.js` script via node:
```
node app.js
```
and visit the provided address via a web browser (`localhost:5002/` by default)

## Credits

Developed for [Freight Traffic Control 2050 Project](http://www.ftc2050.com/ "FTC 2050 Project Homepage"). The FTC2050 project (2016-2019) received funding from the UK Engineering and Physical Sciences Research Council (EPSRC) under grant agreement no. [EP/N02222X/1](http://gow.epsrc.ac.uk/NGBOViewGrant.aspx?GrantRef=EP/N02222X/1 "Official record of Grant EP/N0222X/1").

## Licensing

The FTC2050 Freight Dashboard is licensed under the Apache License 2.0, see the [LICENSE](LICENSE) file.
