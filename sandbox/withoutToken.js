import webservice from '../src/core/webservice'
import places from '../src/core/places'
import coloredStringifiedJson from './coloredStringifiedJson'

webservice.nextDepartures(places.parisGaredeLyon, undefined)
    .then(data => coloredStringifiedJson(data))
    .then((highlightedData) => console.log(highlightedData))

