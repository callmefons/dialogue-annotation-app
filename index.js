// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
var _ = require('lodash');
const moment = require('moment-timezone');
const uuidv4 = require('uuid/v4');

const expressApp = express();

// Import the service function and various response classes
const {
	dialogflow,
	Confirmation
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

const RECORD_TYPES = {
	TIME_START: 'time-start',
	TIME_STOP: 'time-stop',
	TIME_PERIOD: 'time-period',
	START_RECORD: 'start',
	RECORDING: 'recording',
	STOP_RECORD: 'stop',
	SHOW: 'show',
	LOGIN: 'login',
	CLEAR: 'clear',
	FALLBACK: 'fallback',
	OTHER: 'other'
}


app.intent('talk', async (conv, params) => {

	let responseText = await talk(conv, params);
	conv.ask(responseText);
	
})

async function talk(conv, params){

	let response = "";

	conv.user.storage.start = null;
	conv.user.storage.stop = null;
 
	if(!Array.isArray(conv.user.storage.activities)){
		conv.user.storage.dialogue = [];
		conv.user.storage.activities = [];
	}
	
	if(conv.user.storage.email && conv.user.storage.password){

			const activityResult = await db.getActivity(params['activity']);
				
			if(activityResult.length > 0){

				const user = {
					id: conv.user.storage.id,
					name: conv.user.storage.name, 
					email: conv.user.storage.email, 
					password: conv.user.storage.password
				};

				const activity = {
					id: activityResult[0].id,
					name: activityResult[0].activity,
				};

				conv.user.storage.user = user;
				conv.user.storage.activity = activity;

				if(params['time-start']){
						
					const uuid = uuidv4();
					const timeStart = params['time-start'];
					
					let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
					conv.user.storage.startActivity = startActivity;

					const responseText = `When you have finished work?`;
					response = responseText;
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.TIME_START);

				}else if (params['time-period']){

						
					const uuid = uuidv4();
					const timeStart = params['time-period'].startTime;
					const timeStop =  params['time-period'].endTime;

					let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
					let stopActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStop}

					await eneact.upload(user, startActivity, stopActivity, (error)=> {			
						if(!error){
							const responseText = `${activity.name} is record from ${timeStart} to ${timeStop}`;
							response = responseText;
							db.insertRowsAsStream(conv, responseText, RECORD_TYPES.TIME_PERIOD);

						}else{
							const responseText = `Cannot upload ${activity.name}`;
							response = responseText;
							db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);

						}
					});
					
				
				}else{

					let recording = _.find(conv.user.storage.activities, { 'name': activity.name});
					if(recording === undefined) {

						const uuid = uuidv4();
						const timeStart =  moment().tz('Asia/Tokyo').format();
						let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
						conv.user.storage.activities.push(startActivity);
		
						const responseText = `${activity.name} is started`;
						response = responseText;
						db.insertRowsAsStream(conv, responseText, RECORD_TYPES.START_RECORD);

					}else{
						const responseText = `Sorry! ${activity.name} is recording`;
						response = responseText;
						db.insertRowsAsStream(conv, responseText, RECORD_TYPES.RECORDING);

					}

				}
				

			}else{

				const responseText = `No acivity ${params['activity']} in DB`;
				response = responseText;
				db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);


			}

		
	
	}else{
		const responseText = `Please login with ${eneact.API} account, by saying \'login\'`;
		response = responseText;
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);

	}	

	return response;

}


app.intent('stop', async (conv, params) => {

	const activityResult = await db.getActivity(params['activity']);
				
	if(activityResult.length > 0){

		const user = conv.user.storage.user;
		const activity = conv.user.storage.activity;

		let recording = _.find(conv.user.storage.activities, { 'name': activity.name});
		if(recording === undefined) {
			const responseText = `You have not stated ${activity.name} yet`;
			conv.ask(responseText);
		}else{

			const timeStop =  moment().tz('Asia/Tokyo').format()
			let stopActivity = {id: activity.id, name: activity.name, uuid: recording.uuid, timestamp: timeStop}

			await eneact.upload(user, recording, stopActivity, (error) => {			
				if(!error){
					conv.user.storage.activities = _.pullAllWith(conv.user.storage.activities, [recording], _.isEqual);
					const responseText = `${activity.name} is stopped`;
					conv.ask(responseText);
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.STOP_RECORD);
				}else{
					const responseText = `Cannot upload ${activity.name}`;
					conv.ask(responseText);
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);
				}
			});
			
		}
	}else{

		const responseText = `No acivity ${params['activity']} in DB`;
		conv.ask(responseText);
	}

});

app.intent('time-stop', async (conv, params) => {
		
	const timeStop =  params['time-stop'];
	const user = conv.user.storage.user;
	const activity = conv.user.storage.startActivity;
	let stopActivity = {id: activity.id, name: activity.name, uuid: activity.uuid, timestamp: timeStop}

	await eneact.upload(user, activity, stopActivity, (error) => {			
		if(!error){
			const responseText = `${activity.name} is record from ${activity.timestamp} to ${timeStop}`;
			conv.ask(responseText);
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.TIME_STOP);
		}else{
			const responseText = `Cannot upload ${activity.name}`;
			conv.ask(responseText);
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);
		}
	});

})

app.intent('fallback', async (conv, params) => {

	const responses = [
		"I didn't get that. Can you say it again?",
		"I missed what you said. What was that?",
		"Sorry, could you say that again?",
		"Sorry, can you say that again?",
		"Can you say that again?",
		"Sorry, I didn't get that. Can you rephrase?",
		"Sorry, what was that?",
		"One more time?",
		"What was that?",
		"Say that one more time?",
		"I didn't get that. Can you repeat?",
		"I missed that, say that again?"
	]

	const responseText = _.sample(responses);
	conv.ask(responseText);
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);

});

app.intent('show', async (conv, params) => {
	
	let response = "";
	
	if (Array.isArray(conv.user.storage.activities)){

		if(conv.user.storage.activities.length > 0){
			conv.user.storage.activities.forEach(activity => {
				response += "activity: " + activity.name + " \n\n" + "time: " + activity.timestamp + " \n\n"
			});;
		}else{
			response = "No activity is recording"
		}
		
	}

	const responseText = response;
	conv.ask(responseText);
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.SHOW);
});



app.intent('login', async (conv, params) => {
	
	const user = {login: params['email'], password: params['password']};

	await eneact.login(user, (error, userSelf)=> {
		if(!error){

			conv.user.storage.id = userSelf.id;
			conv.user.storage.name = userSelf.name;
			conv.user.storage.email = userSelf.email;
			conv.user.storage.password = userSelf.password;

			const responseText = `Hi! ${conv.user.storage.name}`;
			conv.ask(responseText);
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.LOGIN);

		}else{
			const responseText = `${error}`;
			conv.ask(responseText);
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);
		}

	});

});

app.intent('logout', async (conv, params) => {
	conv.user.storage = {};
	const responseText = `You have successfully signed out of your ${API} account.`;
	conv.ask(responseText);
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.LOGIN);

});

app.intent('clear', async (conv, params) => {
	conv.user.storage.activities = {};
	const responseText = `Clear local storage`;
	conv.ask(responseText);
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.CLEAR);

});


expressApp.use(bodyParser.urlencoded({ extended: true }))
expressApp.use(bodyParser.json());
expressApp.post('/fulfillment', app);

expressApp.get('/', async (req, res) => {
	const result = await db.getActivity();
	res.send(result)
});

expressApp.get('/load_json', (req, res) => {
	db.loadJSONFromGCSAutodetect();
	res.send(`loadJSONFromGCSAutodetect`);
})
	
const httpServer = http.createServer(expressApp);
const httpsServer = https.createServer(credentials, expressApp);
const httpPort = 80;
// const httpPort = 3000;
const httpsPort = 443;

httpServer.listen(httpPort, () => {
	console.log(`HTTP Server running on port ${httpPort}`);
});

httpsServer.listen(httpsPort, () => {
	console.log(`HTTP Server running on port ${httpsPort}`);
});


