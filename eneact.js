const request = require('request');
const j = request.jar();
const moment = require('moment');
const uuidv4 = require('uuid/v4');
const requestPromise = require('request-promise-native').defaults({ simple: false });

const API = 'https://bigact.sozolab.jp/';
const loginAPI = `${API}login`;
const logoutAPI = `${API}logout`;
const uploadAPI = `${API}sensors/0/upload`

const db = require('./db');

function login(user, callback){

    const logoutOptions = {uri: logoutAPI,jar: j,method: "GET", resolveWithFullResponse: true};
    const loginOptions = {uri: loginAPI,jar: j,method: "POST",json: true,body: user, resolveWithFullResponse: true};

    return requestPromise( logoutOptions )
    .then( logoutBody => {
       
        if(logoutBody.statusCode == 200){
            return requestPromise( loginOptions )
            .then( loginRes => {
        
                // console.log(`loginRes ${loginRes.statusCode}`)
                
                if(loginRes.statusCode == 302 || loginRes.statusCode == 200){
        
                    const cookie = j.getCookieString(loginAPI);
                    const activitiesAPI = `${API}users/self.json`
                    const activityOptions = {uri: activitiesAPI, headers: {'cookie': cookie},method: "GET",json: true};
            
                    return requestPromise( activityOptions )
                    .then( selfRes => {
                        
                        let userSelf = {
                            id: selfRes.id,
                            name: selfRes.name,
                            email: selfRes.email_address,
                            password: user.password
                        }
            
                        return callback(null, userSelf);
            
                    }).catch(error => {
                        console.log(`Cannot get user self ${error}`)
                        return callback(err);
                    });
            
                }else{
                    return callback(`Email or password incorrect`); 
                }
        
            }).catch(error => {
                console.log(`Cannot login ${error}`)
                return error;
            });
        }
    }).catch(error => {
        console.log(`Cannot logout ${error}`)
        return error;
    });
}



async function upload(user, activity, callback){

    const loginOptions = {uri: loginAPI,jar: j,method: "POST",json: true,body: {login: user.email, password: user.password}, resolveWithFullResponse: true};

    return requestPromise( loginOptions )
    .then( loginRes => {
        const cookie = j.getCookieString(loginAPI); 
        
        const timestamp =  moment().format();
        let uuid = uuidv4();
        const version = '8.8';
        const type = 'label';

        const date = new Date();
        const time = date.getTime();
        const rand = Math.floor(Math.random() * 100000);
        const filename =  `${type}_${time}_${rand}.csv`;
        
        let startBody = {
            filename: filename, type: type, version: version, 
            data: `${timestamp},${activity.id},${activity.name},true,${user.id};,${uuid},`
        };
        const startOptions = {uri: uploadAPI, headers: {'cookie': cookie},method: "POST",json: true, body: startBody, resolveWithFullResponse: true};

        return requestPromise( startOptions )
        .then( startRes => {
            
            console.log(`startRes.statusCode ${startRes.statusCode}`);

            let stopBody = {
                filename: filename, type: type, version: version, 
                data: `${timestamp},${activity.id},${activity.name},false,${user.id};,${uuid},`
            };
            const stopOptions = {uri: uploadAPI, headers: {'cookie': cookie},method: "POST",json: true, body: stopBody, resolveWithFullResponse: true};
    
            return requestPromise( stopOptions )
            .then( stopRes => {
                
                console.log(`stopRes.statusCode ${stopRes.statusCode}`);
                return callback(null); 
    
            }).catch(error => {
                console.log(`File upload fails ${error}`)
                return callback(`File upload fails ${error}`); 
            });

        }).catch(error => {
            console.log(`File upload fails ${error}`)
            return callback(`File upload fails ${error}`); 
        });

            

    }).catch(error => {
        console.log(`Cannot login ${error}`)
        return callback(`Cannot login ${error}`); 
    });	

}

module.exports = {
    login: login,
    upload: upload,
    API: API
};

