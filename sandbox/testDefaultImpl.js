import webservice from '../src/core/webservice'
import places from '../src/core/data/places'
import coloredStringifiedJson from './coloredStringifiedJson'

webservice.nextDepartures(places.parisGaredeLyon).then(data => coloredStringifiedJson(data))
    .then(highlightedData => console.log(highlightedData))