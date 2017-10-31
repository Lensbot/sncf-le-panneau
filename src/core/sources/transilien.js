import {get, post} from 'axios'
import DomParser from 'dom-parser'
import capitalize from '../operations/capitalize'

const idfStationUrl = 'https://www.transilien.com/fr/horaires/prochains-departs'
const fetchTransilien = s => post(idfStationUrl, `departure=${encodeURIComponent(s.fields.intitule_gare)}&uicDestination=&destination=&uicDeparture=${s.fields.uic.replace(/^0+/, '').slice(0, -1)}`, {headers:{'Content-Type':'application/x-www-form-urlencoded', Referer:'https://www.transilien.com/fr/horaires/prochains-departs'}})

const flatten = data => data.childNodes.filter(x=>!x.text||!x.text.match(/^\s*$/)).map(x=>x.text?x.text.trim():flatten(x)).reduce((acc, value)=>acc.concat(value),[])
const transilien = html => new DomParser().parseFromString(html.data)
    .getElementsByClassName('next-departure-result').map(result => flatten(result).filter(x=>!['Destination', 'Voir les arrêts', 'Gares Desservies', 'FERMER'].includes(x)))
    .map(r=>{debugger;return r})
    .map(result=>result[0].toUpperCase() === 'TRAIN' ? ['Transilien',...result.slice(1)] : result)
    .map(result=>result[5] === 'Voie --' ? [...result.slice(0, 5), '', ...result.slice(5)] : result)
    .map(result=>[result[0].toUpperCase(), result[1].substring(result[1].indexOf('-')+1).toUpperCase(), ...result.slice(2)])
    .map((result,i)=> {
        return {
            savedNumber:result[2]+i,
            stop_date_time: {
                base_departure_date_time: result[3],
            },
            dataToDisplay: {
                mode: result[0],
                name: result[1],
                direction: capitalize(result[4]).replace('Gare De ', '').replace('Gare D\' ', ''),
                number: result[2],
                missionCode: result[2],
                time: result[3],
                platform: result[5],
                stops: result.slice(7).map(stop=>capitalize(stop).replace('Gare De ', '').replace('Gare D\' ', ''))
            }}})

const baseDepartures = ({nestedSearchData:{stations}}) =>
    Promise.all(stations.map(station => fetchTransilien(station).then(html => transilien(html)))).then(departuresArray => departuresArray.reduce((acc, value) => acc.concat(value), []))



export default {baseDepartures,
    metadata: {features:['departures', 'journeys','platforms','journeys'], everywhere: true, butSpecificForRegion:'Île-de-France',
        ratings:{relevancy: 5, reliability: 2, sustainability: 1}}}