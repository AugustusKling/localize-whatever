const TileLayer = ol.layer.Tile;
const TileImage = ol.source.Image;
const Map = ol.Map;
const View = ol.View;
const WMTS = ol.tilegrid.WMTS;
const XYZ = ol.source.XYZ;

const blueMarble = new TileLayer({
  projection: 'EPSG:4326',
  source: new XYZ({
    url: 'tiles/blue-marble/{z}/{x}/{-y}.png',
    attributions: 'Background image: Visible Earth by NASA',
    projection: 'EPSG:4326',
    minZoom: 0,
    maxZoom: 6
  }),
});

const viewProj = ol.proj.get('EPSG:4326');

const locationsSource = new ol.source.Vector({
    projection: 'EPSG:4326',
    attributions: 'Places data from geojson.xyz'
});
const locationsLayer = new ol.layer.Vector({
    source: locationsSource,
    style: f => {
        if(f.get('correct')) {
            const geometry = f.getGeometry();
            if(geometry instanceof ol.geom.Point || geometry instanceof ol.geom.MultiPoint) {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 10,
                        fill: new ol.style.Fill({color: 'rgba(255, 0, 0, 0.1)'}),
                        stroke: new ol.style.Stroke({color: 
                        'green', width: 1})
                    }),
                    text: new ol.style.Text({
                        text: f.get('name'),
                        font: '20px sans-serif',
                        offsetY: 20,
                        fill: new ol.style.Fill({color: 'green'}),
                        stroke: new ol.style.Stroke({color: 'white', width: 2})
                    })
                });
            } else if (geometry instanceof ol.geom.LineString || geometry instanceof ol.geom.MultiLineString) {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({color: 'green', width: 5}),
                    text: new ol.style.Text({
                        text: f.get('name'),
                        font: '20px sans-serif',
                        offsetY: 20,
                        placement: 'line',
                        overflow: true,
                        fill: new ol.style.Fill({color: 'green'}),
                        stroke: new ol.style.Stroke({color: 'white', width: 2})
                    })
                });
            } else {
                return [new ol.style.Style({
                    fill: new ol.style.Fill({color: 'rgba(0, 255, 0, 0.4)'}),
                    stroke: new ol.style.Stroke({color: 'green', width: 1})
                }), new ol.style.Style({
                    geometry: f => {
                        if (geometry instanceof ol.geom.MultiPolygon) {
                            return ol.geom.Polygon.fromExtent(f.getGeometry().getExtent());
                        } else {
                            return geometry;
                        }
                    },
                    text: new ol.style.Text({
                        text: f.get('name'),
                        font: '20px sans-serif',
                        overflow: true,
                        fill: new ol.style.Fill({color: 'green'}),
                        stroke: new ol.style.Stroke({color: 'white', width: 2})
                    })
                })];
            }
        } else {            
            return new ol.style.Style({
                stroke: new ol.style.Stroke({color: 
                    'red', width: 3}),
                text: new ol.style.Text({
                    text: (f.get('distance')/1000).toFixed(0) + ' km',
                    font: '20px sans-serif',
                    offsetY: 20,
                    placement: 'line',
                    fill: new ol.style.Fill({color: 'red'}),
                    stroke: new ol.style.Stroke({color: 'white', width: 2})
                })
            });
        }
    }
});


const map = new Map({
  layers: [ blueMarble, locationsLayer ],
  target: 'map',
  view: new View({
    projection: viewProj,
    center: ol.extent.getCenter(viewProj.getExtent()),
    zoom: 2
  }),
});

function setupChallengeProjection(def, worldExtent) {
    proj4.defs("challenge", def);
    ol.proj.proj4.register(proj4);
    const challengeProjection =  ol.proj.get("challenge");
    challengeProjection.setWorldExtent(worldExtent);
    const fromLonLat = ol.proj.getTransform('EPSG:4326', challengeProjection);
    const extent = ol.extent.applyTransform(worldExtent, fromLonLat, undefined, 8);
    challengeProjection.setExtent(extent);
    return challengeProjection;
}

// https://dev.to/codebubb/how-to-shuffle-an-array-in-javascript-2ikj
const shuffleArray = array => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

function getName(properties) {
    return properties.name || properties.NAME_ENGL || properties.RIVER_MAP;
}

let iChallenge = 0;
let totalError = 0;
let clickListener;
const geoJsonReader = new ol.format.GeoJSON();
async function restart() {
    const url = document.querySelector('#dataset').value;
    const region = document.querySelector('#region').value;
    const questions = document.querySelector('#questions').value;

    iChallenge = 0;
    totalError = 0;
    locationsSource.clear();
    ol.Observable.unByKey(clickListener);
    
    const geojson = await (await fetch(url)).json();
    if (!geojson.properties) {
        geojson.properties = {};
    }
    if (!geojson.properties.name) {
        geojson.properties.name = url;
    }
    
    console.log(`${geojson.properties.name} has ${geojson.features.length} challenges.`);
    let regionFilter = undefined;
    if (region !== '') {
        regionFilter = geoJsonReader.readGeometry(region);
        geojson.features = geojson.features.filter(f => {
            const featureGeometry = geoJsonReader.readGeometry(f.geometry);
            return regionFilter.intersectsCoordinate(ol.extent.getCenter(featureGeometry.getExtent()));
        });
    }
    geojson.features = geojson.features.filter(f => getName(f.properties));
    shuffleArray(geojson.features);
    geojson.features.length = Math.min(questions, geojson.features.length);
    
    let challengeProjection;
    if (geojson.properties.projection && geojson.properties.extent) {
        challengeProjection = setupChallengeProjection(geojson.properties.projection, geojson.properties.extent);
    } else {
        challengeProjection = ol.proj.get('EPSG:4326');
    }
    
    map.setView(new View({
        projection: challengeProjection,
        center: ol.extent.getCenter(challengeProjection.getExtent()),
        zoom: 2,
        extent: regionFilter ? regionFilter.getExtent() : challengeProjection.getExtent(),
        showFullExtent: true
    }));
    map.getView().fit(challengeProjection.getExtent());
    
    const totalErrorOutput = document.querySelector('#total-error');
    totalErrorOutput.innerText = totalError + 'km';
    const whereIs = document.querySelector('#where-is');
    whereIs.innerHTML = `Where is ${getName(geojson.features[iChallenge].properties)}?`;
    
    clickListener = map.on('click', (e) => {
        const correctFeature = geoJsonReader.readFeature(geojson.features[iChallenge]);
        correctFeature.getGeometry().transform('EPSG:4326', challengeProjection);
        correctFeature.set('correct', true);
        correctFeature.set('name', getName(correctFeature.getProperties()));
        locationsSource.addFeature(correctFeature);
        
        const clickCoordinate = map.getEventCoordinate(e.originalEvent);
        if (!correctFeature.getGeometry().intersectsCoordinate(clickCoordinate)) {
            const errorLine = new ol.geom.LineString([
                clickCoordinate,
                correctFeature.getGeometry().getClosestPoint(clickCoordinate)
            ]);
            const clickFeature = new ol.Feature(errorLine);
            clickFeature.set('name', correctFeature.get('name'));
            clickFeature.set('correct', false);
            const distance = ol.sphere.getLength(
                errorLine,
                { projection: challengeProjection}
            );
            clickFeature.set('distance', distance);
            locationsSource.addFeature(clickFeature);
            
            totalError = totalError + distance;
            
            totalErrorOutput.innerText = (totalError/1000).toFixed(0) + 'km';
            
            map.getView().fit(ol.extent.extend(
                map.getView().calculateExtent(),
                errorLine.getExtent()
            ));
        }
        
        if(iChallenge < geojson.features.length -1 ){
            iChallenge = iChallenge + 1;
            whereIs.innerHTML = `Where is ${getName(geojson.features[iChallenge].properties)}?`;
        } else {
            console.log('done');
            whereIs.innerHTML = '';
            ol.Observable.unByKey(clickListener);
        }
    });
};
