var map,
	svgPaths,
	heatSurface,
	boundsCol,
	boundsLayer,
	pathsLayer,
	heatLayer,
	selectedOsmNodes = [],
	selectedTuidsFromMap = [],
	nodesVisitedByTrip = {},
	selectedTuids = [];

var tripsDimCurrentSelection;

var osmNodes = {};
var filterPolygon = [];
var filterPolygons = [];

var drawnItems;

var concurrentJourneysVizLim = 1000;
var heatmapPointIntensity = 0.1;
var numOfPointsForHeatmapFullIntensity = 30;
var heatmapPointRadius = 25;

var geoJsonPath;
geoJsonPath = 'mapMatchedSimplified';

$.getJSON('static/geojson/nodes.json', function(data){
	for (var i = 0; i < data['features'].length; i ++){
		var n = data['features'][i];
		osmNodes[n.properties.osmid] = n.geometry.coordinates;
	}
});

function mapSetup(initialSet){

	addToNodesVisitedDict(initialSet);

	//leaflet map setup
	var CartoDB_DarkMatterNoLabels = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_nolabels/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
		subdomains: 'abcd',
		maxZoom: 19
	});

	// feature group for user-drawn spatial filters
	//need to clear when new data is loaded
	if(!map){
		map = L.map('mapid').setView([51.515, -0.09], 14)
			.addLayer(CartoDB_DarkMatterNoLabels);

		//pane containing the area of interest's boundary
		map.createPane('boundary');
		map.getPane('boundary').style.zIndex = 404;
		map.getPane('boundary').style.pointerEvents = 'none';

		//pane that will hold the trip geometries
		map.createPane('overlayTrips');
		map.getPane('overlayTrips').style.zIndex = 406;

		//setting up the drawing interface, for drawing custom buffer and filter zones
		map.createPane('drawing');
		map.getPane('drawing').style.zIndex = 405;

		drawnItems = new L.FeatureGroup();
	     map.addLayer(drawnItems);

	     var drawControlsOptions = {
	     	edit: {
	             featureGroup: drawnItems,
	             edit: false
	         },
	         draw: {
	         	polygon: {
	                allowIntersection: false, // Restricts shapes to simple polygons
	                drawError: {
	                    color: '#e1e100', // Color the shape will turn when intersects
	                    message: '<strong>Polygon cannot intersect itself' // Message that will show when intersect
	                },
	                shapeOptions: {
						pane: 'drawing',
	                    color: '#bada55'
	                }
	            },
	            rectangle:{
	            	shapeOptions: {
						pane: 'drawing',
	                    color: '#bada55'
	                }
	            },
	            polyline: false,
	            circle:false,
	            marker: false,
	            circlemarker:false
	         }
	     };
	     
	     var drawControl = new L.Control.Draw(drawControlsOptions);
	     map.addControl(drawControl);

	     map.on(L.Draw.Event.CREATED, function (e) {

	        // var type = e.layerType;
	        var layer = e.layer;

	        filterPolygons.length = 0;
	        drawnItems.eachLayer(function(layerDi){
	        	var fp = [];
	        	var p = layerDi.getLatLngs();
	        	for(var i = 0; i < p[0].length; i ++){
		    		fp.push([p[0][i].lng, p[0][i].lat]);
		    	}
	        	filterPolygons.push(fp);

			});

	    	filterPolygon.length = 0;
	    	var p = layer.getLatLngs();
	    	for(var i = 0; i < p[0].length; i ++){
	    		filterPolygon.push([p[0][i].lng, p[0][i].lat]);
	    	}
	    	filterPolygons.push(filterPolygon);
	    	drawnItems.addLayer(layer);

			selectedOsmNodes = getOsmNodesInArea(filterPolygons);
	    	selectedTuidsFromMap = getTuidsPassingFromNodes(selectedOsmNodes);
	    	filterTripId(selectedTuidsFromMap);
	    });

	     map.on(L.Draw.Event.DELETED, function (e) {
	     	var layer = e.layer;
	        filterPolygons.length = 0;
	        drawnItems.removeLayer(layer);

	        drawnItems.eachLayer(function(layerDi){
	        	var fp = [];
	        	var p = layerDi.getLatLngs();
	        	for(var i = 0; i < p[0].length; i ++){
		    		fp.push([p[0][i].lng, p[0][i].lat]);
		    	}

	        	filterPolygons.push(fp);
			});

			selectedOsmNodes = getOsmNodesInArea(filterPolygons);
	    	selectedTuidsFromMap = getTuidsPassingFromNodes(selectedOsmNodes);
	    	filterTripId(selectedTuidsFromMap);
	    });

	     map.on("overlayadd", function (event) {
	     	if(event.name == "Destinations Heatmap"){
	     		updateHeatmapOverlay();
	     	}
	     	else if(event.name == 'Paths'){
	     		updateTripsOverlay();
	     	}
	     });

	     map.on("zoomend", function (e) { setLegend(); });

	 	$.getJSON('static/geojson/col.json', function(data){

			boundsCol = L.geoJson(data, {
			        color: 'white',
			        fillColor: 'none',
			        pane: 'boundary'
			}).addTo(map)
			;
	 	});

	    pathsLayer = L.layerGroup().addTo(map);
	    heatLayer = L.layerGroup().addTo(map);
	    heatSurface = L.heatLayer([]).addTo(heatLayer);
	    heatSurface.setOptions({maxZoom:1, max:1, radius: heatmapPointRadius, blur:15, alpha:1, gradient:{1: 'red', 0.7: 'orange', 0.4: 'yellow', 0.1: 'white'}});

		updateTripsOverlay();
	    updateHeatmapOverlay();

	 	var baseMaps = {
		    "CartoDB": CartoDB_DarkMatterNoLabels
		};

		var overlayMaps = {
		    "Paths": pathsLayer,
		    "Destinations Heatmap": heatLayer
		};

	 	L.control.layers(baseMaps, overlayMaps).addTo(map);
	 	L.control.scale().addTo(map);

	 	setLegend();
	}
};

function updateDataset(doUpdate = false){

	if(!doUpdate && tripsDim.top(Infinity).length > concurrentJourneysVizLim){
		return;
	}

	tripsDimCurrentSelection = tripsDim.top(Infinity);

	selectedTuids.length = 0;
 	for (var key in tripsDimCurrentSelection) {
    	selectedTuids.push(tripsDimCurrentSelection[key]['tripData']['TripID']);
	};
	updateHeatmapOverlay();
	updateTripsOverlay();
}

function updateHeatmapOverlay(){
	if(heatSurface._map){
		var waypointsDimCurrentSelection = waypointTripIdDim.top(Infinity);

		if(heatSurface){
			heatSurface._latlngs = [];
		}

		waypointsDimCurrentSelection.forEach(function(d){
			if(selectedTuids.includes(d.SourceWaypoints.TripID)){
				heatmapPointIntensity = 1 / numOfPointsForHeatmapFullIntensity;
				heatSurface.addLatLng(L.latLng(d.SourceWaypoints.Latitude, d.SourceWaypoints.Longitude, heatmapPointIntensity));
			}
		});
	}
}

function updateTripsOverlay(){
	if(pathsLayer._map){
		var tripsDimCurrentSelection = tripsDim.top(Infinity);
		selectedTuids.length = 0;
	 	for (var key in tripsDimCurrentSelection) {
	    	selectedTuids.push(tripsDimCurrentSelection[key]['tripData']['TripID']);
		};

		if(tripsDimCurrentSelection.length != 0){
			var firstSelectedTid = selectedTuids[0];
			var d;
			for (let i = 0; i < journeysTripData.length; i++) {
				if(journeysTripData[i].tripData.TripID == firstSelectedTid){
					d = journeysTripData[i];
					break;
				}
			}
			var latLngList = createLatLongListFromGeoJSON(d._id);
			var polyline = createLeafletPolylineFromLatLongList(latLngList, 'cyan', d.tripData.TripID);
			polyline.addTo(pathsLayer);
		}

		var updateSelection = d3.select(map.getPane('overlayTrips')).select("svg").select("g").selectAll("path");
		// updateSelection.remove();
		var tripsDimCurrentSelectionForD3 = tripsDimCurrentSelection.filter(function(d){
			return selectedTuids.includes(d.tripData.TripID);
		})
		shuffle(tripsDimCurrentSelectionForD3);
		tripsDimCurrentSelectionForD3.splice(concurrentJourneysVizLim);

		updateSelection = updateSelection.data(tripsDimCurrentSelectionForD3);

		console.log("BOB");
		updateSelection
			.enter()
				.append(function(d,i){
					if(i <= concurrentJourneysVizLim) {
						var latLngList = createLatLongListFromGeoJSON(d._id);
					}
					else{
						var latLngList = [];
					}
					var polyline = createLeafletPolylineFromLatLongList(latLngList, 'cyan', d.tripData.TripID);
					polyline.addTo(pathsLayer);
					return L.DomUtil.get(polyline._path);
				});

		updateSelection
			.exit()
				.remove();
		
		console.log("BOB2");
	}
}

function calcPixelSizeInMeters(){
	// from StackOverflow answer: https://stackoverflow.com/a/27546312
	var centerLatLng = map.getCenter(); // get map center
	var pointC = map.latLngToContainerPoint(centerLatLng); // convert to containerpoint (pixels)
	var pointX = [pointC.x + 1, pointC.y]; // add one pixel to x
	var pointY = [pointC.x, pointC.y + 1]; // add one pixel to y

	// convert containerpoints to latlng's
	var latLngC = map.containerPointToLatLng(pointC);
	var latLngX = map.containerPointToLatLng(pointX);
	var latLngY = map.containerPointToLatLng(pointY);

	var distanceX = latLngC.distanceTo(latLngX); // calculate distance between c and x (latitude)
	var distanceY = latLngC.distanceTo(latLngY); // calculate distance between c and y (longitude)

	return distanceX;
}

function createLatLongListFromGeoJSON(geojsonId){
	var geojson = journeysGeomData[geojsonId].matchings;

	var latLngList = [];
	for (var i = 0; i < geojson.length; i++) {
		var gjson = geojson[i].geometry;
		for (var i = 0; i < gjson.coordinates.length; i++) {
			var point = new L.LatLng(gjson.coordinates[i][1], gjson.coordinates[i][0]);
			latLngList.push(point);
		};
	};
	return latLngList;
}

function createLeafletPolylineFromLatLongList(latLngList, _color = 'red', _id){
	var pointList = latLngList;

	var polyline = new L.polyline(pointList, {
		id: _id,
		pane: 'overlayTrips',
	    color: _color,
	    weight: 2,
	    opacity: 0.05,
	    smoothFactor: 3.0
	});
	return polyline;
}

function getVisitedNodesFromJSON(tJson){
	try{
		var outList = [];
		var matchings = journeysGeomData[tJson._id].matchings;
		matchings.forEach(function(d){
			var tripLegs = d.legs;
			var tempList = [];
			for(var i = 0; i < tripLegs.length; i ++){
				tempList = tempList.concat(tripLegs[i].annotation.nodes);
			}
			var newList = tempList;
			newList = newList.map(function(x){
				return x.toString();
			});
			outList.push.apply(outList, newList);
		});
		return outList;
	}
	catch{
		console.log(tJson);
		console.trace();
	}
}

function getOsmNodesInArea(vsTop){
	var keys = Object.keys(osmNodes);
	var newList = [];
	for (var j = 0; j < vsTop.length; j++) {
		var vs = vsTop[j];
		for(var i = 0; i < keys.length; i ++){
			if(pointInPolygon(osmNodes[keys[i]], vs)){
				newList.push(keys[i]);
			}
		};
	};
	return newList;
}

function getTuidsPassingFromNodes(filteredNodesList){
	var newList = [];

	for (var i = filteredNodesList.length - 1; i >= 0; i--) {
		var tuidsTemp2 = [];
		for (var key in nodesVisitedByTrip){
			if(nodesVisitedByTrip[key].includes(filteredNodesList[i])){
				tuidsTemp2.push(key);
			}
		}
		newList = newList.concat(tuidsTemp2);
	};

	newList = newList.filter(unique);
	newList = newList.filter(Boolean);
	return newList;
}

function addToNodesVisitedDict(tripsList){
	tripsList.forEach(function(d){
		if(!(d.tripData.TripID in nodesVisitedByTrip)){
			var nv = getVisitedNodesFromJSON(d);
			nodesVisitedByTrip[d.tripData.TripID.toString()] = nv;
		}
	})
}

function removeFromNodesVisitedDict(input){
	if(typeof input === "string"){
		removeTrip(input);
	}
	else{
		for (let i = 0; i < input.length; i++) {
			const tid = input[i];
			removeTrip(tid);
		}
	}

	function removeTrip(tid){
		if(tid in nodesVisitedByTrip){
			delete nodesVisitedByTrip[tid];
		}
	}
}

function setLegend(){
	var lt = document.getElementById("legendText");

	var rMeters = heatmapPointRadius * calcPixelSizeInMeters();
	var numPoints = Math.round(numOfPointsForHeatmapFullIntensity);
	var newText = `destination locations in ${Math.round(rMeters)}m radius`;
	lt.innerText = newText;

	document.getElementById("legendText-full").innerText = `${numPoints}`;
	document.getElementById("legendText-half").innerText = `${numPoints/2}`;
}