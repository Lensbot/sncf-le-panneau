import request from 'axios'
import moment from 'moment'
import stations from './stations'
import idfMapping from './idfMapping'

const dateTimeFormat = 'YYYYMMDDTHHmmss'
const sncfApiPrefix = 'https://api.sncf.com/v1/coverage/sncf/'
const stationUrlPrefix = `${sncfApiPrefix}stop_areas/`
const garesSncfDeparturesUrl = (tvs) => `https://www.gares-sncf.com/fr/train-times/${tvs.toUpperCase()}/departure`
const stationUrl = (stationId, dateTime, startPage) => `${stationUrlPrefix}${stationId}/departures?start_page=${startPage}&from_datetime=${dateTime.format(dateTimeFormat)}`
const inverseGeocodingUrl = ({long, lat}) => `${sncfApiPrefix}coords/${long};${lat}/places_nearby?type[]=stop_area`
const vehicleJourneyUrl = (vehicleJourney) => `${sncfApiPrefix}vehicle_journeys/${vehicleJourney}`
const placeUrl = (place) => `${sncfApiPrefix}places?q=${place}`
const registeredStations = stations.filter (e => e.fields.tvs)

const departures = (stationId = 'stop_area:OCE:SA:87391003', page = 0, token) => request({
    method: 'get',
    url: stationUrl(stationId, moment(), page),
    headers: {
        'Authorization': token,
    },
}).then((result) => Promise.resolve([...result.data.departures]))
  .catch((error) => {console.log(`${stationUrl(stationId, moment(), page)}: ${error}`);Promise.resolve([])})

const places = (label, token) => request({
    method: 'get',
    url: placeUrl(label),
    headers: {
        'Authorization': token,
    },
}).then((result) => Promise.resolve([result.data.places.filter(place => place.embedded_type === 'stop_area').sort((a, b) => b.quality - a.quality)]))

const inverseGeocoding = (coords, token) => request({
    method: 'get',
    url: inverseGeocodingUrl(coords),
    headers: {
        'Authorization': token,
    },
}).then((result) => {
    if (!result.data.places_nearby) {
        throw new Error(`Gare non trouvée par géolocalisation inversée {lat:${coords.lat}, long:${coords.long}}`)
    }
    return Promise.resolve(result.data.places_nearby)
}).catch((error) => {console.log(`${inverseGeocodingUrl(coords)}: ${error}`);throw error})

const test = (token) => request({
    method: 'get',
    url: sncfApiPrefix,
    headers: {
        'Authorization': token,
    },
})

const getGaresSncfDepartures = (tvs, departuresData = []) => request({
    method: 'get',
    url: garesSncfDeparturesUrl(tvs)
}).then((result) => {
    if (!Array.isArray(result.data.trains)) {
        return Promise.resolve(departuresData)
    }
    return Promise.resolve(departuresData.map(departure => {
        const gareSncf = result.data.trains.find(train => train.num === departure.display_informations.headsign)
        return gareSncf && {gareSncf,...departure}}))
})

const vehicleJourney = (departure, fromStation, token) => request({
    method: 'get',
    url: vehicleJourneyUrl(departure.links.find(link => link.type === 'vehicle_journey').id),
    headers: {
        'Authorization': token,
    },
}).then((result) => {
    const allStops = result.data.vehicle_journeys[0].stop_times.map(
        stop_time => stop_time.stop_point.name.replace(/ /g, '\u00a0').replace(/-/g, '\u2011').replace(/\//g, '\u00a0\u00a0\u00a0\u0338'))
    const allStopsCoords = result.data.vehicle_journeys[0].stop_times.map(stop_time => { return {
        name:stop_time.stop_point.name.replace(/ /g, '\u00a0').replace(/-/g, '\u2011').replace(/\//g, '\u00a0\u00a0\u00a0\u0338'),
        geometry:{coordinates:[parseFloat(stop_time.stop_point.coord.lon), parseFloat(stop_time.stop_point.coord.lat)]}}})
    const missionCode = result.data.vehicle_journeys[0].name &&
        result.data.vehicle_journeys[0].name[0] >= 'A' &&  result.data.vehicle_journeys[0].name[0] <= 'Z'
        ? result.data.vehicle_journeys[0].name.substring(0, 4) : undefined
    const foundStationInJourney = closestStations(allStopsCoords, {lat: fromStation.geometry.coordinates[1], long: fromStation.geometry.coordinates[0]})[0].name
    const indexOfStop = allStops.indexOf(foundStationInJourney)
    const stops = allStops.slice(indexOfStop + 1)
    return Promise.resolve({...departure, stops, missionCode})
})

const distance = ([long1, lat1], [long2, lat2]) => Math.sqrt(Math.pow(long2 - long1, 2) + Math.pow(lat2 - lat1, 2))
const distanceBetween= (station1, station2) =>
    distance([station1.geometry.coordinates[1], station1.geometry.coordinates[0]],
        station2.geometry ? [station2.geometry.coordinates[1], station2.geometry.coordinates[0]] :
            [-station1.geometry.coordinates[1], -station1.geometry.coordinates[0]])

const closestStations = (theStations, {long, lat}) => {
    const thisPoint =  {geometry:{coordinates:[long, lat]}}
    const closestStation = theStations.reduce((a, b) => 
        distanceBetween(thisPoint, a) < distanceBetween(thisPoint, b) ? a : b, theStations[0])
    return theStations.filter(station =>
        station.geometry.coordinates[0] === closestStation.geometry.coordinates[0] &&
        station.geometry.coordinates[1] === closestStation.geometry.coordinates[1])
}

const sortedByDateTime = (departuresData) => [].concat.apply([], departuresData).sort((d1, d2) =>
    d1.stop_date_time.base_departure_date_time.localeCompare(d2.stop_date_time.base_departure_date_time))
const flatten = (array) => array.reduce((a, b) => a.concat(b), []).filter(x => x)

const nextDepartures = ({long, lat}, token) => {
    const stations = closestStations(registeredStations, {long, lat})
    const stationName = stations[0].fields.intitule_gare
    const iataCodes = stations.map(station => (station.fields.tvs || '').split('|')[0])
    const stationCoords = {long:stations[0].geometry.coordinates[0], lat:stations[0].geometry.coordinates[1]}
    return inverseGeocoding(stationCoords, token).catch(e => places(stationName, token))
            .then((stations) => Promise.all(stations.map(station => departures(station.id, 0, token))))
            .then((departuresData) => Promise.all(iataCodes.map(iataCode => getGaresSncfDepartures(iataCode, sortedByDateTime(departuresData)))))
            .then((departuresData) => Promise.all(flatten(departuresData).map(departure => vehicleJourney(departure, stations[0], token))))
            .then((departuresData) => Promise.resolve({station: stationName,
                departures:departuresData.map(e => {return {
                    mode: e.display_informations.commercial_mode,
                    name: e.display_informations.code,
                    color: e.display_informations.color,
                    number: e.missionCode || idfMapping[e.display_informations.headsign] || e.display_informations.headsign,
                    time: moment(e.stop_date_time.departure_date_time, dateTimeFormat).format('HH:mm'),
                    direction: e.route.direction.stop_area.name,
                    platform: e.gareSncf ? e.gareSncf.voie : '',
                    stops: e.stops}})}))
}

export default {nextDepartures, test}
