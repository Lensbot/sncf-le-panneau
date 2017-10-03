import {get} from 'axios'
import moment from 'moment'
import flatten from 'arr-flatten'

const sncfApiPrefix = 'https://api.sncf.com/v1/coverage/sncf/'
const stationUrlPrefix = `${sncfApiPrefix}stop_areas/`
const stationUrl = (stationId, dateTime, startPage) => `${stationUrlPrefix}${stationId}/departures?start_page=${startPage}&from_datetime=${dateTime.format('YYYYMMDDTHHmmss')}`
const inverseGeocodingUrl = ({long, lat}) => `${sncfApiPrefix}coords/${long};${lat}/places_nearby?type[]=stop_area`
const vehicleJourneyUrl = (vehicleJourney) => `${sncfApiPrefix}vehicle_journeys/${vehicleJourney}`
const placeUrl = (place) => `${sncfApiPrefix}places?q=${place}`

const defaultEntity = (token) => {return {headers: {Authorization: token || null}}}
const fetch = (url, entity) => entity && entity.headers && entity.headers.Authorization === null ? Promise.resolve() : get(url, entity)

const places = (label, token) => fetch(placeUrl(label), defaultEntity(token))
    .then((result) => Promise.resolve([result.data.places.filter(place => place.embedded_type === 'stop_area').sort((a, b) => b.quality - a.quality)]))

const inverseGeocoding = (coords, token) => fetch(inverseGeocodingUrl(coords), defaultEntity(token))
    .then((result) => {
        if (!result) {
            return Promise.resolve([])
        }
        if (!result.data.places_nearby) {
            throw new Error(`Gare non trouvée par géolocalisation inversée {lat:${coords.lat}, long:${coords.long}}`)
        }
        return Promise.resolve(result.data.places_nearby)
    }).catch((error) => {console.log(`${inverseGeocodingUrl(coords)}: ${error}`);throw error})

const stationsDepartures = (stationsAreas, token) => token ?
    Promise.all(stationsAreas.map(stationArea => departures(stationArea.id, 0, token))).then(departuresArrays => flatten(departuresArrays)) :
    Promise.resolve([])

const departures = (stationId, page = 0, token) => fetch(stationUrl(stationId, moment(), page), defaultEntity(token))
    .then(result => Promise.resolve([...result.data.departures]))
    .then(result => result.map(departure => {return {
    links: departure.links,
    stop_date_time: departure.stop_date_time,
    savedNumber: parseInt(departure.display_informations.headsign),
    dataToDisplay: {
        mode: departure.display_informations.commercial_mode,
        direction: departure.display_informations.direction.replace(/ \([^)]+\)$/, ''),
        name: departure.display_informations.code,
        color: departure.display_informations.color,
        number: departure.display_informations.headsign,
        status: departure.display_informations.status,
        time: moment(departure.stop_date_time.departure_date_time, 'YYYYMMDDTHHmmss').format('HH:mm'),
        stops: departure.display_informations.stops
    }}})).catch((error) => {console.log(`${stationUrl(stationId, moment(), page)}: ${error}`);Promise.resolve([])})



const vehicleJourney = (closestStations, link, fromCoords, token) => fetch(vehicleJourneyUrl(link), defaultEntity(token))
    .then(result => {
        const allStops = result.data.vehicle_journeys[0].stop_times.map(
            stop_time => stop_time.stop_point.name.replace(/ /g, '\u00a0').replace(/-/g, '\u2011').replace(/\//g, '\u00a0\u00a0\u00a0\u0338'))
        const allStopsCoords = result.data.vehicle_journeys[0].stop_times.map(stop_time => { return {
            name:stop_time.stop_point.name.replace(/ /g, '\u00a0').replace(/-/g, '\u2011').replace(/\//g, '\u00a0\u00a0\u00a0\u0338'),
            geometry:{coordinates:[parseFloat(stop_time.stop_point.coord.lon), parseFloat(stop_time.stop_point.coord.lat)]}}})
        const missionCode = result.data.vehicle_journeys[0].name &&
        result.data.vehicle_journeys[0].name[0] >= 'A' &&  result.data.vehicle_journeys[0].name[0] <= 'Z'
            ? result.data.vehicle_journeys[0].name.substring(0, 4) : undefined
        const foundStationInJourney = closestStations(fromCoords, allStopsCoords)[0].name
        const indexOfStop = allStops.indexOf(foundStationInJourney)
        const stops = allStops.slice(indexOfStop + 1)
        const number = result.data.vehicle_journeys[0].stop_times.find(stopTime => stopTime.headsign).headsign
        return Promise.resolve({
            savedNumber: parseInt(number),
            dataToDisplay: {
            direction: stops[stops.length - 1],
            number: missionCode,
            stops},
            link,
            missionCode,
            departureStation: indexOfStop === 0,
            longMissionCode: result.data.vehicle_journeys[0].name})
    })

const testApi = (token) => fetch(sncfApiPrefix, defaultEntity(token))

const twoClosestJourneys = (departures, closestStations, stationCoords, token) => token ? Promise.all(
    departures.slice(0, 2).map(departure => departure.links &&
        vehicleJourney(closestStations, departure.links.find(link => link.type === 'vehicle_journey').id,
            stationCoords, token))) : Promise.resolve([])

export {places, inverseGeocoding, stationsDepartures, vehicleJourney, testApi, twoClosestJourneys}