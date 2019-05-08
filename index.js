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

const methods = {
    BASELINE: 'baseline',
    PROPOSED: 'proposed'
}

let method = methods.BASELINE; 

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
					name: activityResult[0].activity,
					questions: activityResult[0].questions
				};


				if (!Array.isArray(conv.user.storage.activities)){
					conv.user.storage.activities = [];
				}

				let recording = _.find(conv.user.storage.activities, { 'name': activity.name});
				if(recording === undefined) {

					if(action === 'stop'){
						conv.ask(`You have not stated ${activity.name} yet`)
					}else{
						
						const uuid = uuidv4();
						const timeStart =  moment().tz('Asia/Tokyo').format();
						let startActivity = {id: activity.id, name: activity.name, uuid: uuid, timestamp: timeStart}
						conv.user.storage.activities.push(startActivity);
						conv.user.storage.currentActivity = activity.name;
						conv.user.storage.count = activityResult.length;

						const responseText = `${activity.questions}`;
						db.insertRowsAsStream(conv, responseText);
						conv.ask(responseText);
					}
				
				}else{

					if(action === 'stop'){

						const timeStop =  moment().tz('Asia/Tokyo').format()
						let stopActivity = {id: activity.id, name: activity.name, uuid: recording.uuid, timestamp: timeStop}

						await eneact.upload(user, recording, stopActivity, (error)=> {			
							if(!error){
								conv.user.storage.activities = _.pullAllWith(conv.user.storage.activities, [recording], _.isEqual);
								const responseText = `${activity.name} is stopped`;
								db.insertRowsAsStream(conv, responseText);
								conv.ask(responseText);
							}else{
								const responseText = `Cannot upload ${activity.name}`;
								db.insertRowsAsStream(conv, responseText);
								conv.ask(responseText);
							}
						});

					}else{
						const responseText = `${activity.name} is recording`;
						db.insertRowsAsStream(conv, responseText);
						conv.ask(responseText);
					}	
				}
				

			}else{

				const responseText = `No acivity ${acivityParam} in DB`;
				db.insertRowsAsStream(conv, responseText);
				conv.ask(responseText);
			}

		}
	
	}else{
		const responseText = `Please login with ${eneact.API} account, by saying \'login\'`;
		db.insertRowsAsStream(conv, responseText);
		conv.ask(responseText);
	}	

})



app.intent('Default Fallback Intent', async (conv, params) => {

	if(conv.user.storage.currentActivity != null){
		const responseText = `${conv.user.storage.currentActivity} is started`;
		db.insertRowsAsStream(conv, responseText);
		conv.ask(responseText);
		conv.user.storage.currentActivity = null;
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
		db.insertRowsAsStream(conv, responseText);
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
	db.insertRowsAsStream(convActivity, responseText);
	conv.ask(responseText);
});

app.intent('talk - yes', (conv, params) => {
	//console.log(conv.body.queryResult.outputContexts[0].parameters.activity);
})

app.intent('login', async (conv, params) => {
	
	const user = {login: params['email'], password: params['password']};
			
	await eneact.login(user, (error, userSelf)=> {
		if(!error){

			conv.user.storage.id = userSelf.id;
			conv.user.storage.name = userSelf.name;
			conv.user.storage.email = userSelf.email;
			conv.user.storage.password = userSelf.password;

			const responseText = `Hi! ${conv.user.storage.name}`;
			db.insertRowsAsStream(conv, responseText);
			conv.ask(responseText);

		}else{
			const responseText = `${error}`;
			db.insertRowsAsStream(conv, responseText);
			conv.ask(responseText);
		}

	});

});

app.intent('logout', async (conv, params) => {
	conv.user.storage = {};
	const responseText = `You have successfully signed out of your ${API} account.`;
	db.insertRowsAsStream(conv, responseText);
	conv.ask(responseText);
});

app.intent('clear', async (conv, params) => {
	conv.user.storage.activities = {};
	const responseText = `Clear local storage`;
	db.insertRowsAsStream(conv, responseText);
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


