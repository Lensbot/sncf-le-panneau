import {get, post} from 'axios'
import DomParser from 'dom-parser'
import inMemory from './inMemory'
import capitalize from '../operations/capitalize'

const readCookie = (response, name) => response.headers['set-cookie'].find(x => x.includes(name)).replace(/; HttpOnly/ig, '').replace(/; path=\//ig, '').replace(/; Domain=\.sncf\.com/ig, '')

const headersFrom = (infoRequest, redirect) => {return {headers:{
    Cookie: [readCookie(infoRequest, 'SNCCACHE'), readCookie(infoRequest, 'SNC_city'), readCookie(redirect.response, 'JSESSIONID'), readCookie(redirect.response, 'SNCSESSION')].join('; ')}}}

const iterate = (condition, oldResponse, promiseGenerator) => {
    const forcedResponseAsFunction = typeof oldResponse === 'function' ? oldResponse : () => oldResponse
    if (oldResponse && !condition(forcedResponseAsFunction())) {
        return forcedResponseAsFunction
    }
    return promiseGenerator().then(newResponse => iterate(condition, newResponse, promiseGenerator))
}

const promiseWhile = (condition, execute, oldResponse) => iterate(condition, oldResponse,
    () => execute().then(newResponse => promiseWhile(condition, execute, newResponse)))

const baseDepartures = stationAreas => get('http://www.sncf.com/fr/horaires-info-trafic').then(infoRequest =>
        promiseWhile(response => new DomParser().parseFromString(response.data).getElementsByClassName('tab-depart').length === 0,
            () => post(`http://www.sncf.com/sncf/gare`, `libelleGare=${stationAreas[0].fields.intitule_gare.toLowerCase().replace(/[^a-z]/g, '-')}`, {maxRedirects: 0}).catch(redirect =>
                get(`http://www.sncf.com${redirect.response.headers.location.replace('/sncf/..', '')}`, headersFrom(infoRequest, redirect))))
                .then(response => new DomParser().parseFromString(response().data).getElementsByClassName('tab-depart')
                    .find(element => element.nodeName === 'ul').childNodes
                    .filter(childNode => childNode.nodeName !== '#text')
                    .map(childNode => [...childNode.childNodes.filter(subChildNode => subChildNode.nodeName !== '#text')
                        .map(subChildNode => subChildNode.childNodes
                            .map(subSubChildNode => {return {text: subSubChildNode.text, attributes: subSubChildNode.attributes, innerText: (subSubChildNode.childNodes||[]).map(subSubSubChildNode => subSubSubChildNode.text)}})
                            .filter(subSubChildNode => !subSubChildNode.text || !subSubChildNode.text.match(/^\s+$/)))])
                    .map(childNodes => {
                        return {
                            savedNumber: parseInt(childNodes["1"]["1"].attributes["2"].value),
                            stop_date_time: {
                                base_departure_date_time: (childNodes["0"]["0"].innerText["0"]||'').replace('h', ':')
                            },
                            dataToDisplay: {
                                mode: childNodes["2"]["0"].innerText["0"],
                                direction: capitalize(childNodes["1"]["0"].text || childNodes["1"]["0"].innerText["0"]).trim(),
                                number: childNodes["1"]["1"].attributes["2"].value,
                                time: (childNodes["0"]["0"].innerText["0"]||'').replace('h', ':'),
                                platform: childNodes["3"]["0"].text === '--' ? undefined : childNodes["3"]["0"].text,
                                stops: []}}})))

const stationSearch = (coords) => Promise.resolve(inMemory.closestStations(coords))

export default {stationSearch, baseDepartures, feed:[]}