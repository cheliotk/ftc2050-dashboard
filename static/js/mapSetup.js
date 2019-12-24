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

var concurrentJourneysVizLim = 500;
var heatmapPointIntensity = 0.1;
var numOfPointsForHeatmapFullIntensity = 10;
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

		map.createPane('boundary');
		map.getPane('boundary').style.zIndex = 404;
		map.getPane('boundary').style.pointerEvents = 'none';

		//setting up the drawing interface, for drawing custom buffer adn filter zones
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
	                    message: '<strong>Oh snap!<strong> you can\'t draw that!' // Message that will show when intersect
	                },
	                shapeOptions: {
	                    color: '#bada55'
	                }
	            },
	            rectangle:{
	            	shapeOptions: {
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
	    	// console.log(selectedTuidsFromMap);
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
	     		updateSvgOverlayNoJQ(svgPaths.selection, svgPaths.projection);
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

	    svgPaths = L.d3SvgOverlay(updateSvgOverlayNoJQ, {zoomHide: false, zoomDraw: false}).addTo(pathsLayer);

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

	if(!doUpdate && tripsDim.top(Infinity).length > 1000){
		return;
	}

	// console.trace();

	tripsDimCurrentSelection = tripsDim.top(Infinity);

	selectedTuids.length = 0;
 	for (var key in tripsDimCurrentSelection) {
    	selectedTuids.push(tripsDimCurrentSelection[key]['tripData']['TripID']);
    };
    updateSvgOverlayNoJQ(svgPaths.selection, svgPaths.projection);
    updateHeatmapOverlay();
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

function updateSvgOverlayNoJQ(selection, projection){
	if(pathsLayer._map){
		var tripsDimCurrentSelection = tripsDim.top(Infinity);
		selectedTuids.length = 0;
	 	for (var key in tripsDimCurrentSelection) {
	    	selectedTuids.push(tripsDimCurrentSelection[key]['tripData']['TripID']);
	    };

	    var updateSelection = selection.selectAll('path')
			.data(tripsDimCurrentSelection, function(d) {if(selectedTuids.includes(d.tripData.TripID)) {return d.tripData.TripID;} else {return null;} });

	    updateSelection
	    .attr('stroke-width', 1.5 / projection.scale)
	    .each(function(d,i){
	    	if(i < concurrentJourneysVizLim){
	    		var datum = d3.select(this);
				datum.attr('d', function(d){return createPathFromGeoJSON(d._id, projection)});
				datum.attr('stroke', 'cyan');
				datum.attr('stroke-width', 1.5 / projection.scale);
				datum.attr('fill','none');
				datum.attr('stroke-opacity', 0.1);
	    	}
	    })
	    .enter()
			.append('path')
			.attr('id', function(d){return '_' + d.tripData.TripID;})
			.each(function(d,i){
				if(!(d.tripData.TripID in nodesVisitedByTrip)){
			    	var nv = getVisitedNodesFromJSON(d);
					var keys = Object.keys(nodesVisitedByTrip);
					nodesVisitedByTrip[d.tripData.TripID] = nv;
				}

				var datum = d3.select(this);
				datum.attr('stroke', 'cyan');
				datum.attr('stroke-width', 1.5 / projection.scale);
				datum.attr('fill','none');
				datum.attr('fill','none');        			
				datum.attr('stroke-opacity', 0.1);

				if(i < concurrentJourneysVizLim){
					datum.attr('d', function(d){return createPathFromGeoJSON(d._id, projection)});
				}
			});

		updateSelection
			.exit()
			.remove();
	}
}

function calcPixelSizeInMeters(){
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

function createPathFromGeoJSON(geojsonId, svgPathsProj){
	var geojson = journeysGeomData[geojsonId].matchings;
	var pathString = '';
	for (var i = 0; i < geojson.length; i++) {
		var gjson = geojson[i].geometry;
		var pathSubstring = svgPathsProj.pathFromGeojson(gjson);
		if(pathSubstring != undefined){
			pathString += pathSubstring;
		}
	};
	return pathString;
}

function createLatLongListFromGeoJSON(geojsonId){
	var geojson = journeysGeomData[geojsonId].matchings;
	// var pathString = '';

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

function createLeafletPolylineFromLatLongList(latLngList, color = 'red'){
	var pointList = latLngList;

	var polyline = new L.polyline(pointList, {
	    color: color,
	    weight: 1,
	    opacity: 0.1,
	    smoothFactor: 1
	});
	return polyline;
}

function getVisitedNodesFromJSON(tJson){
	try{
		var outList = [];
		var matchings = journeysGeomData[tJson._id].matchings;
		matchings.forEach(function(d){
			// var tripLegs = tJson.matchings[0].legs;
			var tripLegs = d.legs;
			var tempList = [];
			for(var i = 0; i < tripLegs.length; i ++){
				tempList = tempList.concat(tripLegs[i].annotation.nodes);
			}
			var newList = tempList;
			newList = newList.map(function(x){
				return x.toString();
			});
			// newList = newList.filter(unique);
			outList.push.apply(outList, newList);
			// return newList;
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

function getTuidsPassingFromNodes(filteredNodesList, newTuids = []){
	var nodesVisitedByTripNew = [];

	if(newTuids.length != 0){

		for (var t = 0; t < newTuids.length; t++) {
			if(!(newTuids[t] in nodesVisitedByTrip)){

				var d = journeysTripData.filter(function(journey){
					return journey.tripData.TripID == newTuids[t];
				});

		    	var nv = getVisitedNodesFromJSON(d[0]);
				nodesVisitedByTrip[newTuids[t]] = nv;
			}

			nodesVisitedByTripNew[newTuids[t]] = nodesVisitedByTrip[newTuids[t]];
		};
	}
	else{
		nodesVisitedByTripNew = nodesVisitedByTrip;
	}

	var newList = [];

	for (var i = filteredNodesList.length - 1; i >= 0; i--) {
		var tuidsTemp2 = [];
		for (var key in nodesVisitedByTripNew){
			if(nodesVisitedByTripNew[key].includes(filteredNodesList[i])){
				tuidsTemp2.push(key);
			}
		}
		newList = newList.concat(tuidsTemp2);
	};

	newList = newList.filter(unique);
	newList = newList.filter(Boolean);
	return newList;
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