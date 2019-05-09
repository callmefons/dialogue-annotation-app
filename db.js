// Imports the Google Cloud client library
const {BigQuery} = require('@google-cloud/bigquery');
const {Storage} = require('@google-cloud/storage');
const moment = require('moment-timezone');

const bigqueryClient = new BigQuery({
	projectId: 'fon-dialog-label',
	keyFilename: './fon-dialog-label-12ff5a7f2fc8.json',
});

const storageClient = new Storage({
    projectId: 'fon-dialog-label',
    keyFilename: './fon-dialog-label-12ff5a7f2fc8.json',
});


async function loadJSONFromGCSAutodetect() {

  const datasetId = "activity_dataset";
  const tableId = "activity_table";
  const bucketName = 'dialog_labels';
  const filename = 'nd-proceesed.json';

  const metadata = {
    sourceFormat: 'NEWLINE_DELIMITED_JSON',
		autodetect: true  
	};

  // Load data from a Google Cloud Storage file into the table
  const [job] = await bigqueryClient
    .dataset(datasetId)
    .table(tableId)
		.load(storageClient.bucket(bucketName).file(filename), metadata);
		
  // load() waits for the job to finish
  console.log(`Get ${job.id} completed.`);

  // Check the job's status for errors
  const errors = job.status.errors;
  if (errors && errors.length > 0) {
    throw errors;
  }
}

async function getActivity(activity) {

	const query = `SELECT a.id, a.name AS activity, r.name AS questions
	FROM \`activity_dataset.activity_table\` AS a, UNNEST(record_types) AS r
	WHERE a.name = \'${activity}\'`;

	const options = {query: query};

	// Run the query as a job
	const [job] = await bigqueryClient.createQueryJob(options);
	console.log(`Job ${job.id} started.`);

	// Wait for the query to finish
  const [rows] = await job.getQueryResults();

	return rows;
}

async function insertRowsAsStream(conv, responseText, recordType) {

  const datasetId = `reports`;
  const tableId = `action_log`;
 
  const logInput = {
    time: moment().tz('Asia/Tokyo').format().toString(),
    userId: conv.user.storage.id,
    userEmail: conv.user.storage.email,
    text: conv.input.raw,
    intent: conv.intent,
    recordType: recordType,
    locale: conv.user.locale,
    responseText: responseText,
    conversationId: conv.id,
  };

  console.log(logInput)


  let errors = await bigqueryClient.dataset(datasetId).table(tableId).insert([logInput]);
 
  if (errors && errors.length && errors[0].insertErrors) {
    console.error(`Bigquery Insert failed ${errors[0].insertErrors}`);
  }else{
    console.log(`Insert ${logInput.conversationId} completed.`);
  }

}


module.exports = {
    insertRowsAsStream: insertRowsAsStream,
    loadJSONFromGCSAutodetect: loadJSONFromGCSAutodetect,
    getActivity: getActivity
  };