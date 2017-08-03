import request from 'axios'
import moment from 'moment'
import stations from './stations'

const dateTimeFormat = 'YYYYMMDDTHHmmss'
const sncfApiPrefix = 'https://api.sncf.com/v1/coverage/sncf/'
const openDataStations = 'https://ressources.data.sncf.com/explore/dataset/referentiel-gares-voyageurs/download/?format=json&timezone=Europe/Berlin'
const stationUrlPrefix = `${sncfApiPrefix}stop_areas/`
const garesSncfDeparturesUrl = (tvs) => `https://www.gares-sncf.com/fr/train-times/${tvs.toUpperCase()}/departure`
const stationUrl = (stationId, dateTime, startPage) =>
    `${stationUrlPrefix}${stationId}/departures?start_page=${startPage}&from_datetime=${dateTime.format(dateTimeFormat)}`
const placeUrl = (place) => `${sncfApiPrefix}places?q=${place}`
const vehicleJourneyUrl = (vehicleJourney) => `${sncfApiPrefix}vehicle_journeys/${vehicleJourney}`
const registeredStations = stations.filter (e => e.fields.tvs)

const departures = (stationId = 'stop_area:OCE:SA:87391003', page = 0, token) => request({
    method: 'get',
    url: stationUrl(stationId, moment(), page),
    headers: {
        'Authorization': token,
    },
}).then((result) => Promise.resolve([...result.data.departures])).catch((error) => Promise.resolve([]))

const place = (label, token) => request({
    method: 'get',
    url: placeUrl(label),
    headers: {
        'Authorization': token,
    },
}).then((result) => Promise.resolve(result.data.places.filter(place => place.embedded_type === 'stop_area')[0])).catch((error) => Promise.resolve({id:'?'}))

const test = (token) => request({
    method: 'get',
    url: sncfApiPrefix,
    headers: {
        'Authorization': token,
    },
})

const getStations = () => request({
    method: 'get',
    url: openDataStations
}).then((result) => Promise.resolve([...result.data.records]))

const getGaresSncfDepartures = (tvs, departuresData = []) => request({
    method: 'get',
    url: garesSncfDeparturesUrl(tvs)
}).then((result) => {
    if (!Array.isArray(result.data.trains)) {
        return Promise.resolve(departuresData)
    }
    return Promise.resolve(departuresData.map(
        departure => {return {
            gareSncf: result.data.trains.find(gare => gare.num === departure.display_informations.headsign),
            ...departure}}))
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
    const foundStationInJourney = closestStation(allStopsCoords, {lat: fromStation.geometry.coordinates[1], long: fromStation.geometry.coordinates[0]}).name
    const indexOfStop = allStops.indexOf(foundStationInJourney)
    const stops = allStops.slice(indexOfStop + 1)
    return Promise.resolve({...departure, stops})
})

const distance = ([long1, lat1], [long2, lat2]) => Math.sqrt(Math.pow(long2 - long1, 2) + Math.pow(lat2 - lat1, 2))
const distanceBetweenStations= (station1, station2) =>
    distance([station1.geometry.coordinates[1], station1.geometry.coordinates[0]],
        station2.geometry ? [station2.geometry.coordinates[1], station2.geometry.coordinates[0]] :
            [-station1.geometry.coordinates[1], -station1.geometry.coordinates[0]])

const closestStation = (theStations, {long, lat}) => theStations.reduce((a, b) =>
    distanceBetweenStations({geometry:{coordinates:[long, lat]}}, a) < distanceBetweenStations({geometry:{coordinates:[long, lat]}}, b) ?
        a : b, theStations[0])

const nextDepartures = ({long, lat}, token) => {
    const station = closestStation(registeredStations, {long, lat})
    const stationName = station.fields.intitule_gare
    const iataCode = station.fields.tvs
    return place(stationName, token)
            .then((station) => departures(station.id, 0, token))
            .then((departuresData) => getGaresSncfDepartures(iataCode, departuresData))
            .then((departuresData) => Promise.all(departuresData.map(row => vehicleJourney(row, station, token))))
            .then((departuresData) => Promise.resolve({station: stationName,
                departures:departuresData.map(e => {return {
                    mode: e.display_informations.commercial_mode,
                    name: e.display_informations.code,
                    color: e.display_informations.color,
                    number: e.display_informations.headsign,
                    time: moment(e.stop_date_time.departure_date_time, dateTimeFormat).format('HH:mm'),
                    direction: e.route.direction.stop_area.name,
                    platform: e.gareSncf ? e.gareSncf.voie : '',
                    stops: e.stops}})}))
}

export default {nextDepartures, test}
