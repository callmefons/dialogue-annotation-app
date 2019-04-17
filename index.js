// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');

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
	
	if(conv.user.storage.email && conv.user.storage.password){

		const action = params['action'];

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


				await eneact.upload(user, activity, (error)=> {
						
					if(!error){
						conv.ask(`Activity ${activity.name} added!  \n`);
					}else{
						conv.close(`Cannot upload ${error}`);
					}
				});
				
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


