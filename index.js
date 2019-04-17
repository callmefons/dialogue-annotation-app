// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
var _ = require('lodash');
const moment = require('moment');
const uuidv4 = require('uuid/v4');

const expressApp = express();

// Import the service function and various response classes
const {
    dialogflow
} = require('actions-on-google');

const app = dialogflow({ debug: false});

const privateKey = fs.readFileSync('/etc/letsencrypt/live/dialog-labels.sozolab.jp/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/dialog-labels.sozolab.jp/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/dialog-labels.sozolab.jp/chain.pem', 'utf8');

const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

const db = require('./db');
const eneact = require('./eneact');


app.intent('talk', async (conv, params) => {
	
	let action = params['action'];

	if(conv.user.storage.email && conv.user.storage.password){

		for (let index in params['activity']) {
	
			const acivityParam = params['activity'][index];
			const activityResult = await db.getActivity(acivityParam);
				
			if(activityResult.length > 0){

				const user = {
					id: conv.user.storage.id,
					name: conv.user.storage.name, 
					email: conv.user.storage.email, 
					password: conv.user.storage.password
				};

				const activity = {
					id: activityResult[0].id,
					name: activityResult[0].name
				};


				if (!Array.isArray(conv.user.storage.activities)){
					conv.user.storage.activities = [{name: "", uuid: ""}];
				}

				let recording = _.find(conv.user.storage.activities, { 'name': activity.name});
				if(recording === undefined) {

					if(action === 'stop'){
						conv.ask(`You have not stated ${activity.name} yet`)
					}else{
						const uuid = uuidv4();
						const timeStart =  moment().format();
						let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
						conv.user.storage.activities.push(startActivity);
						conv.ask(`${activity.name} is started`);
					}
				
				}else{


					if(action === 'stop'){

						const timeStop =  moment().format()
						let stopActivity = {id: activity.id, name: activity.name, uuid: recording.uuid, timestamp: timeStop}

						await eneact.upload(user, recording, stopActivity, (error)=> {			
							if(!error){
								conv.user.storage.activities = _.pullAllWith(conv.user.storage.activities, [recording], _.isEqual);
								conv.ask(`${activity.name} is stopped  \n`);
							}else{
								conv.ask(`Cannot upload ${activity.name} \n`);
							}
						});

					}else{
						conv.ask(`${activity.name} is recording`);
					}

					
				}
				
			

			}else{
					conv.ask(`No acivity ${acivityParam} in DB`);
			}

		}
	
	}else{
		conv.ask(`Please login with ${eneact.API} account, by saying \'login\'`);
	}	

})

app.intent('list', async (conv, params) => {

});

app.intent('clear', async (conv, params) => {
	conv.user.storage.activities = {};
	conv.ask(`Clear storage`)
});

  
app.intent('login', async (conv, params) => {
	
	const user = {login: params['email'], password: params['password']};
			
	await eneact.login(user, (error, userSelf)=> {
		if(!error){

			conv.user.storage.id = userSelf.id;
			conv.user.storage.name = userSelf.name;
			conv.user.storage.email = userSelf.email;
			conv.user.storage.password = userSelf.password;

			conv.ask(`Hi! ${conv.user.storage.name}`);

		}else{
			conv.close(`${error}`);
		}
	});

});

app.intent('logout', async (conv, params) => {
	conv.user.storage = {};
	conv.ask(`You have successfully signed out of your ${API} account.`)
});


expressApp.use(bodyParser.urlencoded({ extended: true }))
expressApp.use(bodyParser.json());
expressApp.post('/fulfillment', app);


expressApp.get('/', async (req, res) => {
	const result = await db.getActivity();
	res.send(result)
});
	
// Starting both http & https servers
const httpServer = http.createServer(expressApp);
const httpsServer = https.createServer(credentials, expressApp);
const httpPort = 80;
const httpsPort = 443;

httpServer.listen(80, () => {
	console.log(`HTTP Server running on port ${httpPort}`);
});

httpsServer.listen(443, () => {
	console.log(`HTTP Server running on port ${httpsPort}`);
});


