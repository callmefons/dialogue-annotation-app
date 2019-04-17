// Imports the Google Cloud client library
const {BigQuery} = require('@google-cloud/bigquery');
const {Storage} = require('@google-cloud/storage');

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

	const query = `SELECT id, name
	FROM \`activity_dataset.activity_table\`
	WHERE name = \'${activity}\'`;

	const options = {query: query};

	// Run the query as a job
	const [job] = await bigqueryClient.createQueryJob(options);
	console.log(`Job ${job.id} started.`);

	// Wait for the query to finish
  const [rows] = await job.getQueryResults();

	return rows;
}

async function insertActivity(activity) {
  
  const datasetId = "activity_dataset";
  const tableId = "temp_activity_table";
  
  const rows = [activity]

  // Insert data into a table
  const [job] = await bigqueryClient
    .dataset(datasetId)
    .table(tableId)
    .insert(rows, {'ignoreUnknownValues':true, 'raw':true});

  // load() waits for the job to finish
  console.log(`Insert ${job.id} completed.`);

  // Check the job's status for errors
  const errors = job.status.errors;
  if (errors && errors.length > 0) {
    throw errors;
  }
}

module.exports = {
    loadJSONFromGCSAutodetect: loadJSONFromGCSAutodetect,
    getActivity: getActivity,
    insertActivity :insertActivity,
};