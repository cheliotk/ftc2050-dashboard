var tripsDim, dateDim, dateDimTot, endDateDim,lengthDim,odDim;
var journeys;
var journeysTripData=[];
var journeysGeomData={};
var tripIdGhostChart;	//not actually rendering this one anywhere, it is used for filtering trips by id
var lengthsChart;
var odChart;
var tripsGroup;
var waypoints;
var waypointTripIdDim;
var timeChart, endTimeChart;

var tripColors = [];
var deviceColors = [];
var tidsToDidsDict = [];

var timeS, timeE;

var wdx, ndx, ndxTot, allTot;

var selectedInMapIdList = [];
var selectedInMapDim, selectedInMapGroup;

var savedFilters;

var journeysLoadCollector = [];
var journeyIdsLoadedThisUpdate = [];
var hasStarted = isSettingUp = isDone = isCurrentlyAdding = false;
var waypointsJsonHolder;

var journeysReceivedSinceStartOfDailyQuery = 0;
var journeysReceivedSinceStartOfQuery = 0;

var timeNow, timeNow_1;
var timeWindowInHours = 24;

var stream;

var advanceTimeRecurring;

hideLoader();
setupQuery(0);

function setupQuery(_dataset = 0){
	isDone = false;

	console.time("dataLoadTimer");

	timeNow = new Date(Date.now());
	updateQueryTimes();
	startQuery();
}

function startQuery(){	
	// console.time("strartQuery");
	showLoader();

	journeysReceivedSinceStartOfQuery = 0;

	var waypointsQuery = '/dashboardLive/api/getStopsByDate/?dt=' + timeS + '&dtEnd='+timeE;

	queue()
		.defer(d3.json, waypointsQuery)
		.await(startQueryStream);
}

function startQueryStream(error, waypointsJson){
	// console.log("startQueryStream");
	if(error){
		console.log('Error: ', error);
	}

	journeyIdsLoadedThisUpdate = [];

	var journeysQuery = '/dashboardLive/api/getJourneysByDate/?dt=' + timeS + '&dtEnd='+timeE;
	waypointsJsonHolder = JSON.parse(JSON.stringify(waypointsJson));
	// console.log(journeysQuery);

	stream = oboe(journeysQuery);
	stream
		.on('start', function(status, headers){
			// console.log(status, headers);
		});
	stream
		.on('done', function(parsedJson){
			if(parsedJson.end){
				finishedStreamingData();
			}
			else{
				addJourneyToCollector(parsedJson);
			}
		});
}

function showLoader()
{
    $(".loader").fadeIn("slow");
}
function hideLoader()
{
    $(".loader").fadeOut("slow");
}

function finishedStreamingData(){
	// console.log("finishedStreamingData");
	isDone = true;
	if(journeysReceivedSinceStartOfDailyQuery != 0){
		appendData(journeysLoadCollector, waypointsJsonHolder);
	}
	journeysLoadCollector.length = 0;
	journeysReceivedSinceStartOfDailyQuery = 0;
	hideLoader();
}

function addJourneyToCollector(jrn){
	// console.log("addJourneyToCollector");
	journeysLoadCollector.push(jrn);
	journeysReceivedSinceStartOfDailyQuery += 1;
	journeysReceivedSinceStartOfQuery += 1;
	checkCollectorSize();
};

function checkCollectorSize(){
	// console.log("checkCollectorSize");
	if(hasStarted){
		if(journeysLoadCollector.length > 10 && !isCurrentlyAdding){
			appendData(journeysLoadCollector, waypointsJsonHolder);
			journeysLoadCollector.length = 0;
		}
	}
	else{
		if(!isSettingUp){
			if(journeysLoadCollector.length > 25){
				setupChartAreas(journeysLoadCollector, waypointsJsonHolder);
				journeysLoadCollector.length = 0;
			}
		}
	}
};

function setupChartAreas(journeysJson, waypointsJson){
	isCurrentlyAdding = true;
	isSettingUp = true;

	tripColors = [];
	deviceColors = [];
	tidsToDidsDict = [];
	journeysTripData.length = 0;
	for (var prop in journeysGeomData) { if (journeysGeomData.hasOwnProperty(prop)) { delete journeysGeomData[prop]; } }

	journeys = JSON.parse(JSON.stringify(journeysJson));
	waypoints = JSON.parse(JSON.stringify(waypointsJson));

	var counter = 0;
	journeys.forEach(function(datum) {
		var d = prepAndLoadTrip(datum);

		journeysTripData.push({'_id' : d._id.toString(), 'tripData' : d.tripData});
		journeysGeomData[d._id] = { '_id' : d._id.toString(), 'matchings' : d.matchings };

		tripColors[d.tripData.TripID.toString()] = randomColorHex();
		deviceColors[d.tripData.DeviceID.toString()] = randomColorHex();

		counter++;
	});

	waypoints.forEach(function(dd){
		dd.SourceWaypoints = dd.Waypoint;
		tripColors[dd.SourceWaypoints.TripID.toString()] = randomColorHex();
	});

	wdx = crossfilter(waypoints);

	ndx = crossfilter(journeysTripData);
	ndxTot = crossfilter(journeysTripData);

	// setting dims
	
	dateDim = ndx.dimension(function(d) { return d['tripData']["StartHour"]; });
	dateDimTot = ndxTot.dimension(function(d) { return d['tripData']["StartHour"]; });
	endDateDim = ndx.dimension(function(d) { return d['tripData']["EndHour"]; });

	lengthDim = ndx.dimension(function(d){ return d['tripData']['distance'] });
	odDim = ndx.dimension(function(d){ return d.tripData.Geospacial; } );
	tripsDim = ndx.dimension(function(d) { return d['tripData']['TripID']; } );
	selectedInMapDim = ndx.dimension(function(d){ return d['tripData']['selectedInMap']; });

	var startingTuids = [];
	tripsDim.top(Infinity).forEach( function(d){
		startingTuids.push(d.tripData.TripID);
	});

	waypointTripIdDim = wdx.dimension(function(d){ return d.SourceWaypoints.TripID.toString(); });

	//setting groups
	var dateGroup = dateDim.group();
	var endDateGroup = endDateDim.group();
	var lengthGroup = lengthDim.group();
	var odGroup = odDim.group();
	tripsGroup = tripsDim.group();

	selectedInMapGroup = selectedInMapDim.group();

	var all = ndx.groupAll();
	allTot = ndxTot.groupAll();

	//setting minmax values for numeric groups
	var dtMax = new Date(timeE).reSetDateType();
	var dtOffset = new Date();
	dtMax.setMinutes(dtMax.getMinutes() - dtOffset.getTimezoneOffset());
    var dtMin = dtMax.addHours(-timeWindowInHours);

    var minDate = dtMin;
    var maxDate = dtMax;

	var minLength = lengthDim.bottom(1)[0]['tripData']['distance'];
	var maxLength = lengthDim.top(1)[0]['tripData']['distance'];

	//initializing charts and hooking up to html elements
	odChart = dc.barChart('#od-row-chart');
	lengthsChart = dc.barChart("#resource-type-row-chart");
	tripIdGhostChart = dc.rowChart("#non");
	var filterJourneysND = dc.numberDisplay("#filtered-journeys-nd");
	var totalJourneysND = dc.numberDisplay('#total-journeys-nd');

	// setting chart properties
	filterJourneysND
		.formatNumber(d3.format("d"))
		.valueAccessor(function(d){return d; })
		.group(all)
		.formatNumber(d3.format(".0f"));

	totalJourneysND
		.formatNumber(d3.format("d"))
		.valueAccessor(function(d){return d; })
		.group(allTot)
		.formatNumber(d3.format(".0f"));

	var viewportWidth = document.getElementsByTagName('body')[0].clientWidth;
	var chartWidth = viewportWidth / 2 - 25 - 40 - 40;

	//time chart with start date only
	timeChart = dc.barChart("#time-chart");
	timeChart
		.width(chartWidth)
		.height(175)
		.margins({top: 10, right: 25, bottom: 20, left: 40})
		.dimension(dateDim)
		.group(dateGroup)
		.transitionDelay(0)
		.transitionDuration(0)
		.x(d3.scale.linear().domain([0,24]))
		.elasticY(true)
		.yAxis().ticks(4)
		;

	endTimeChart = dc.barChart("#time-chart-end");
	endTimeChart
		.width(chartWidth)
		.height(175)
		.colors(['red'])
		.margins({top: 10, right: 25, bottom: 20, left: 40})
		.dimension(endDateDim)
		.group(endDateGroup)
		.transitionDelay(0)
		.transitionDuration(0)
		.x(d3.scale.linear().domain([0,24]))
		.elasticY(true)
		.yAxis().ticks(4)
		;

	odChart
		.width(chartWidth)
		.height(150)
		.transitionDelay(0)
		.transitionDuration(0)
		.margins({top: 10, right: 25, bottom: 20, left: 40})
		.x(d3.scale.ordinal().domain(['EE', 'EI', 'IE', 'II']))
        .xUnits(dc.units.ordinal)
        .elasticY(true)
        .dimension(odDim)
        .group(odGroup);

	lengthsChart
        .width(chartWidth)
        .height(150)
        .transitionDelay(0)
		.transitionDuration(0)
        .dimension(lengthDim)
        .group(lengthGroup)
		.x(d3.scale.linear().domain([minLength, 150]))
		.elasticY(true)
		.xAxisLabel("Length (km)")
		.yAxis().ticks(4);

	tripIdGhostChart
		.width(null)
		.height(250)
		.transitionDelay(0)
		.transitionDuration(0)
        .dimension(tripsDim)
        .group(tripsGroup)
        .xAxis().ticks(4);

    //all done, hook it up to the mapping functions and start
    dc.renderAll();

    hasStarted = true;
    isSettingUp = false;
    isCurrentlyAdding = false;
    waypointsJsonHolder = {};
    journeysJson = waypointsJson = journeys = waypoints = {};
};

function appendData(journeysJson, waypointsJson){
	// console.log("appendData");
	isCurrentlyAdding = true;
	journeys = JSON.parse(JSON.stringify(journeysJson));

	var jtd = [];
	var jgd = {};
	var counter = 0;

	journeys.forEach(function(datum) {
		var d = prepAndLoadTrip(datum);

		jtd.push({'_id' : d._id.toString(), 'tripData' : d.tripData});

		journeysTripData.push({'_id' : d._id.toString(), 'tripData' : d.tripData});
		journeysGeomData[d._id] = { '_id' : d._id.toString(), 'matchings' : d.matchings };

		tripColors[d.tripData.TripID.toString()] = randomColorHex();
		deviceColors[d.tripData.DeviceID.toString()] = randomColorHex();

		counter++;
	});

	if(!(Object.keys(waypointsJson).length === 0)){
		waypoints = JSON.parse(JSON.stringify(waypointsJson));

		waypoints.forEach(function(dd){
			dd.SourceWaypoints = dd.Waypoint;

			tripColors[dd.SourceWaypoints.TripID.toString()] = randomColorHex();
			if(dd.SourceWaypoints.DeviceID){
				deviceColors[dd.SourceWaypoints.DeviceID.toString()] = randomColorHex();
			}
			
		});

		wdx.add(waypoints);
		waypointsJsonHolder = {};
		waypoints = {};
	}

	ndx.add(jtd);
	ndxTot.add(jtd);
	allTot = ndxTot.groupAll();

    journeysJson = waypointsJson = journeys = waypoints = {};

 //    //all done, hook it up to the mapping functions and start
    dc.renderAll();
    if(isDone){
    	mapSetup(tripsDim.top(Infinity));

	    dc.renderlet(function (){
	    	updateDataset();
	    });

	    restoreFilters();
	    restoreFilters();
	    filterTripId(selectedInMapIdList);

	    dc.redrawAll();
    }

    isCurrentlyAdding = false;
};

function prepAndLoadTrip(d){
	journeyIdsLoadedThisUpdate.push(d['tripData']['TripID'].toString());

	var dateFormat = d3.time.format("%Y-%m-%dT%H:%M:%S.%LZ");

	d['tripData']["StartDate"] = dateFormat.parse(d['tripData']["StartDate"]);
	d['tripData']['StartHour'] = d['tripData']['StartDate'].getHours();

	d['tripData']["EndDate"] = dateFormat.parse(d['tripData']["EndDate"]);
	d['tripData']['EndHour'] = d['tripData']['EndDate'].getHours();

	var sumDist = 0;

	d['matchings'].forEach(function(d){
		sumDist += d['distance'];
	});

	d['tripData']['distance'] = Math.round(sumDist/1000.0);

	if(!d.tripData.Geospacial){
		d.tripData.Geospacial = 'EE';
	}

	d['tripData']['selectedInMap'] = 0;

	return d;
}

// function for filtering items on the map
// called from the map script
function filterTripId(selectedIds){
	selectedInMapIdList = [...selectedIds];
	tripIdGhostChart.replaceFilter([selectedIds]);
	dc.redrawAll();
}

function randomColorHex(){
	return hslToHex(Math.random() * (300 - 60) + 60, 50, 50);
	// return '#'+Math.floor(Math.random()*16777215).toString(16);
}

function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


d3.select(window).on('resize.updatedc', function() {
  dc.events.trigger( function() {
    dc.chartRegistry.list().forEach(function(chart) {
            var container = chart.root().node();
            if (!container){
            	return; // some graphs don't have a node (?!)
            }
            container=container.parentNode.getBoundingClientRect();
            chart.width(container.width);
            chart.rescale && chart.rescale(); // some graphs don't have a rescale
      });

      dc.redrawAll(); 
  }, 500);

});

function redrawChartsFunction() {
	// console.time("redrawChartsFunction");
    dc.chartRegistry.list().forEach(function(chart) {
        var container = chart.root().node();
        if (!container){
        	return; // some graphs don't have a node (?!)
        }
        container=container.parentNode.getBoundingClientRect();
        chart.width(container.width);
        chart.rescale && chart.rescale(); // some graphs don't have a rescale
    });

    // console.timeEnd("redrawChartsFunction");
	dc.redrawAll();
  }

var formatHourTick = function(d) {
	var s = d.toLocaleTimeString(navigator.language, {timeZone: 'UTC', hour: '2-digit'});
	if(d.getUTCHours() <= 12){
		s += " AM";
	}
	else{
		s += " PM";
	}
    return s;
}

const unique = (value, index, self) => {
    return self.indexOf(value) === index;
}

function updateQueryTimes(){
	// console.time("updateQueryTimes");
	
	// timeNow = new Date(Date.now());

	timeNow = timeNow.addMinutes(5);

	var dayEq = 4;
	dayEq += timeNow.getUTCDay();

	timeNow.setFullYear(2016,8,5);

	timeNow = new Date('September 2, 2016, 00:00:00');
	timeE = timeNow.toISOString();

	timeNow_1 = new Date(timeNow);
	timeNow_1 = timeNow_1.addHours(-timeWindowInHours);
	timeS = timeNow_1.toISOString();
	// console.timeEnd("updateQueryTimes");
}

function saveFilters(){
	// console.time("saveFilters");
	var filters = [];
    for (var i = 0; i < dc.chartRegistry.list().length; i++)
    {
        var chart = dc.chartRegistry.list()[i];
        for (var j = 0; j < chart.filters().length; j++)
        {
        	if(chart.chartID() != 3){
        		filters.push({'ChartID': chart.chartID(), 'Filter': chart.filters()[j]});
        	}
        }
    }
    savedFilters = filters;

    // console.timeEnd("saveFilters");
}

function restoreFilters(){
	// console.time("restoreFilters");
	if(savedFilters){
		for (var i = 0; i< savedFilters.length; i++)
	    {
	    	// console.log(i, savedFilters[i]);
	        dc.chartRegistry.list()[savedFilters[i].ChartID-1].filter(savedFilters[i].Filter);
	    }
	}

	// console.timeEnd("restoreFilters");
    redrawChartsFunction();
}

function advanceTime(){
	if(hasStarted){
		// console.time("advanceTime");
		saveFilters();

		tripsDim.filterAll();
		lengthDim.filterAll();
		odDim.filterAll();

		dateDim.filterAll();
		endDateDim.filterAll();

		tripsDim.filterAll();
		// tripIdGhostChart.replaceFilter([]);

	    var timeMax = new Date(timeNow);
	    var timeMin = new Date(timeNow_1);

		updateQueryTimes();
		timeE = timeNow.toISOString();

		timeNow_1 = new Date(timeNow);
		timeNow_1.setDate(timeNow.getDate() - 1);

		removeOldTrips(timeMin, timeNow_1);

		timeS = timeMax.toISOString();
		// console.timeEnd("advanceTime");
		startQuery();
	}
}

function removeOldTrips(timeMin, timeMax){
	// console.time("removeOldTrips");
	var timeMinForTripRemoval = new Date(Date.UTC(timeMin.getFullYear(),timeMin.getMonth(),timeMin.getDate(),timeMin.getHours(),timeMin.getMinutes(),timeMin.getSeconds()));
	var timeMaxForTripRemoval = new Date(Date.UTC(timeMax.getFullYear(),timeMax.getMonth(),timeMax.getDate(),timeMax.getHours(),timeMax.getMinutes(),timeMax.getSeconds()));

	timeMinForTripRemoval = timeMinForTripRemoval.addMinutes(-10);

	dateDim.filter([timeMinForTripRemoval, timeMaxForTripRemoval]);
	dateDimTot.filter([timeMinForTripRemoval, timeMaxForTripRemoval]);

	ndx.remove();
	ndxTot.remove();
	dateDimTot.filterAll();

	tripsDim.filterAll();
	lengthDim.filterAll();
	odDim.filterAll();

	dateDim.filterAll();
	endDateDim.filterAll();
}