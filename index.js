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
	START_RECORD: 'start',
	RECORDING: 'recording',
	STOP_RECORD: 'stop',
	RECORD: 'record',
	SHOW: 'show',
	LOGIN: 'login',
	LOGOUT: 'logout',
	CLEAR: 'clear',
    QUESTION: 'question',
	FALLBACK: 'fallback',
	ERROR: 'error',
	OTHER: 'other'
}


app.intent('walk', async (conv, params) => {

	conv.user.storage.questions = [];

	if(!params['location']){
		conv.user.storage.questions.push("Where are you going?")
	}

	let response = await talk(conv, params);
	conv.ask(response);

})

async function talk(conv, params){

	let response = "";

	conv.user.storage.start = null;
	conv.user.storage.stop = null;
	conv.user.storage.location = null;
 
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
					questions:  conv.user.storage.questions
				};

				conv.user.storage.user = user;
				conv.user.storage.activity = activity;

				if(params['time-start'] || params['time-period']){

					/* -------------------- past activity -------------------- */

					if(params['time-start']){
				
						let responseText  = `What time you have finised work?`;
						conv.user.storage.start = params['time-start'];
						conv.user.storage.count = activityResult.length - 1;

						db.insertRowsAsStream(conv, responseText, RECORD_TYPES.QUESTION);
						response = responseText;
					
			
					}else{

						conv.user.storage.start =   params['time-period'].startTime;
						conv.user.storage.stop =  params['time-period'].endTime;
							
						if(conv.user.storage.questions.length > 0){

							conv.user.storage.count = activityResult.length - 1;
							const responseText = `${activity.questions[0]}`;
							db.insertRowsAsStream(conv, responseText, RECORD_TYPES.QUESTION);
							response = responseText;

						}else{
							
							const responseText = `${activity.name} is started`;
							db.insertRowsAsStream(conv, responseText, RECORD_TYPES.RECORD);
							response = responseText;
						}

						
					
					}

				}else{

					/* -------------------- current activity -------------------- */

					let recording = _.find(conv.user.storage.activities, { 'name': activity.name});
					if(recording === undefined) {


						const uuid = uuidv4();
						const timeStart =  moment().tz('Asia/Tokyo').format();
						let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
						conv.user.storage.activities.push(startActivity);
					
						if(conv.user.storage.questions.length > 0){

							conv.user.storage.count = activity.questions.length - 1;
							
							const responseText = `${activity.questions[0]}`;
							db.insertRowsAsStream(conv, responseText, RECORD_TYPES.QUESTION);
							response = responseText;

						}else{
							
							const responseText = `${activity.name} is started`;
							db.insertRowsAsStream(conv, responseText, RECORD_TYPES.RECORD);
							response = responseText;
						}
						

					}else{	

						const responseText = `${activity.name} is recording`;
						db.insertRowsAsStream(conv, responseText, RECORD_TYPES.RECORDING);
						response = responseText;
					}
				}
				

			}else{

				const responseText = `No acivity ${params['activity']} in DB`;
				db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);
				response = responseText;
			}

		
	
	}else{
		const responseText = `Please login with ${eneact.API} account, by saying \'login\'`;
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.ERROR);
		response = responseText;
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
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.RECORD);
			conv.ask(responseText);
		}else{

			const timeStop =  moment().tz('Asia/Tokyo').format()
			let stopActivity = {id: activity.id, name: activity.name, uuid: recording.uuid, timestamp: timeStop}

			await eneact.upload(user, recording, stopActivity, (error)=> {			
				if(!error){
					conv.user.storage.activities = _.pullAllWith(conv.user.storage.activities, [recording], _.isEqual);
					const responseText = `${activity.name} is stopped`;
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.STOP_RECORD);
					conv.ask(responseText);
				}else{
					const responseText = `Cannot upload ${activity.name}`;
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.ERROR);
					conv.ask(responseText);
				}
			});
			
		}
	}else{

		const responseText = `No acivity ${params['activity']} in DB`;
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);
		conv.ask(responseText);
	}

});

app.intent('time-stop', async (conv, params) => {
		
	const user = conv.user.storage.user;
	const activity = conv.user.storage.activity;	
	conv.user.storage.stop = params['time-stop'];

	if(conv.user.storage.questions.length > 0){

		const responseText = `${conv.user.storage.questions[0]}`;
		conv.user.storage.count = conv.user.storage.count - 1;
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.QUESTION);
		conv.ask(responseText);

	}else{
		
		const responseText = `${activity.name} is started`;
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.RECORD);
		conv.ask(responseText);
	}

})

app.intent('Any', async (conv, params) => {

	console.log(`conv.user.storage.count ${conv.user.storage.count}`);

	const user = conv.user.storage.user;
	const activity = conv.user.storage.activity;	

	if(conv.user.storage.count == 0){

		if(conv.user.storage.start == null && conv.user.storage.stop == null){
			const responseText = `${activity.name} is started`;
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.QUESTION);
			conv.ask(responseText);
		}else{
			
			const uuid = uuidv4();
			const timeStart =  conv.user.storage.start;
			const timeStop =  conv.user.storage.stop;

			let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
			let stopActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStop}

			await eneact.upload(user, startActivity, stopActivity, (error)=> {			
				if(!error){
					const responseText = `${activity.name} is record from ${timeStart} to ${timeStop}`;
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.STOP_RECORD);
					conv.ask(responseText);
				}else{
					const responseText = `Cannot upload ${activity.name}`;
					db.insertRowsAsStream(conv, responseText, RECORD_TYPES.ERROR);
					conv.ask(responseText);
				}
			});
					
		}
		
	}else if(conv.user.storage.count > 0){

		const responseText = `${activity.questions[conv.user.storage.count]}`;
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.START_RECORD);
		conv.ask(responseText);
		conv.user.storage.count = conv.user.storage.count - 1;

	}else {
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
		db.insertRowsAsStream(conv, responseText, RECORD_TYPES.FALLBACK);
		conv.ask(responseText);
	}
	

});

app.intent('list', async (conv, params) => {
	
	let response = "";
	if (Array.isArray(conv.user.storage.activities)){
		conv.user.storage.activities.forEach(activity => {
			response += "activity: " + activity.name + " \n\n" + "time: " + activity.timestamp + " \n\n"
		});;
	}else{
		response = "No actvity recording"
	}

	const responseText = response;
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.SHOW);
	conv.ask(responseText);
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
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.LOGIN);
			conv.ask(responseText);

		}else{
			const responseText = `${error}`;
			db.insertRowsAsStream(conv, responseText, RECORD_TYPES.ERROR);
			conv.ask(responseText);
		}

	});

});

app.intent('logout', async (conv, params) => {
	conv.user.storage = {};
	const responseText = `You have successfully signed out of your ${API} account.`;
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.LOGOUT);
	conv.ask(responseText);
});

app.intent('clear', async (conv, params) => {
	conv.user.storage.activities = {};
	const responseText = `Clear local storage`;
	db.insertRowsAsStream(conv, responseText, RECORD_TYPES.CLEAR);
	conv.ask(responseText);
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


