/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';



// lz
var request = require('request');
// lz



var WatsonConversationSetup = require('./lib/watson-conversation-setup');
var DEFAULT_NAME = 'watson-conversation-slots-intro';
var fs = require('fs'); // file system for loading JSON
var vcapServices = require('vcap_services');
var conversationCredentials = vcapServices.getCredentials('conversation');
var watson = require('watson-developer-cloud'); // watson sdk


// lz
var Discovery = require('watson-developer-cloud/discovery/v1');
// lz




var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests

var app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

var workspaceID; // workspaceID will be set when the workspace is created or validated.

const conversation = new watson.AssistantV1({ 
  version: '2018-02-16'
});

var conversationSetup = new WatsonConversationSetup(conversation);
var workspaceJson = JSON.parse(fs.readFileSync('data/watson-pizzeria.json'));
var conversationSetupParams = { default_name: DEFAULT_NAME, workspace_json: workspaceJson };
conversationSetup.setupConversationWorkspace(conversationSetupParams, (err, data) => {
  if (err) {
    //handleSetupError(err);
  } else {
    console.log('Assistant is ready!');
    workspaceID = data;
  }
});



// lz
// Create the Discovery service wrapper
var discovery = new Discovery({
  // if left unspecified here, the SDK will fall back to the DISCOVERY_USERNAME and DISCOVERY_PASSWORD
  // environment properties, and then Bluemix's VCAP_SERVICES environment property
  // username: '62bf8db7-61b5-4d05-b69b-dba27bad4b22',
  // password: 'ObnwQ0LKlICr'
  // url: 'INSERT YOUR URL FOR THE SERVICE HERE'
  version_date: '2017-09-01',
  url: 'https://gateway.watsonplatform.net/discovery/api/'
});
// lz



// Endpoint to be call from the client side
app.post('/api/message', function(req, res) {

  if (!workspaceID) {
    return res.json({
      output: {
        text: 'Assistant initialization in progress. Please try again.'
      }
    });
  }

  var payload = {
    workspace_id: workspaceID,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }




    // lz
    // call Discovery REST API
    var runDiscovery = false;
    console.log(data);
    if (!(data.intents === undefined | Object.keys(data.intents).length === 0)) {
      if (data.intents[0].intent === 'bnbreview') {
        runDiscovery = true;
      }
    }

    if (runDiscovery) {
    //if (!(data === undefined) && data.intents[0].intent === 'bnbreview') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      var description = data.input.text;
      
      callDiscovery(description).then(function (discovery_str) {

        // display search result of Discovery query through Conversation UI
        if (discovery_str == '') {
          data.output.text[0] = '<br><br>The chatbot has not been trained to answer your question/request. <br><br>No relavant entry was found in the Discovery service.  <br><br>';
        } else {
          data.output.text[0] = 'The chatbot has not been trained to answer your question/request. <br><br>Discover service has the following suggestions:  <br><br>';
          data.output.text[0] = data.output.text[0] + discovery_str + '<br><br>';
        }

        //console.log("=====================");
        //console.log(data);

        // set flag to not run Discovery next time
        data.context.discovered = true;

        return res.json(updateMessage(payload, data));

      }).catch((error) => {
        console.error(error);
        console.error("Failed when calling Watson Discovery service");
      });

    } else {






      return res.json(updateMessage(payload, data));


    }
    // lz


    // lz
    //return res.json(updateMessage(payload, data));
    // lz


    
  });
});

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Assistant service
 * @param  {Object} response The response from the Assistant service
 * @return {Object}          The response with the updated message
 */
function updateMessage(input, response) {
  var responseText = null;
  if (!response.output) {
    response.output = {};
  } else {
    return response;
  }
  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  response.output.text = responseText;
  return response;
}




// lz
/**
 * Call Watson Discovery service to search knowledge base
 * @param  string  query_str The query string to the Discovery service
 * @return string            The related document entries returned by the Discovery service
 */
function callDiscovery(query_str) {

  return new Promise((resolve, reject) => {

    var discovery_str = '';
    var discovery_query = '';


    query_str = 'bnb%20shoal%20creek';

    // Setup Watson Discovery query
    discovery_query += process.env.DISCOVERY_URL;
    discovery_query += '/environments/' + process.env.DISCOVERY_ENVIRONMENT_ID;
    discovery_query += '/collections/' + process.env.DISCOVERY_COLLECTION_ID;
    discovery_query += '/query?version=2018-03-05&deduplicate=false&similar=false&count=5&natural_language_query=';
    //discovery_query += '/query?count=10&deduplicate=false&similar=false&version=2018-03-05&natural_language_query=';
    discovery_query += query_str;
    //discovery_query += '\'' + query_str + '\'';

    // call Watson Discovery service
    try {

      request({

        headers:
          { 'content-type': 'application/json' },
        //url: "https://gateway.watsonplatform.net/discovery/api/v1/environments/7ed4b4d5-4590-4a70-8e16-45db7418c0d6/collections/0190ccb0-a79e-49d6-8026-2286c46888bc/query?count=10&deduplicate=false&similar=false&version=2018-03-05&natural_language_query=bnb%20shoal%20creek",
        url: discovery_query,
        method: "GET",
        auth: {
          user: process.env.DISCOVERY_USERNAME,
          pass: process.env.DISCOVERY_PASSWORD
        }
      }, function (err, resp, body) {
        if (err) {
          resolve(err);
        } else {
          // process the search result of Discovery query
          var resp_obj = JSON.parse(resp.body);
          console.log("+++++++++++++++++++++");
          console.log(resp_obj);
          console.log("+++++++++++++++++++++");

          for (var i = 0; i < resp_obj.matching_results; i++) {
          //for (var i = 0; i < 3; i++) {
            discovery_str += "Suggestion " + (i + 1).toString() + ":     " + resp_obj.results[i].text.trim() + "\n\n";
            //console.log(resp_obj.results[i].text.trim());
          }

          console.log("=====================");
          console.log(discovery_str);
          console.log("=====================");

          resolve(discovery_str);
        }

      });

    } catch (error) {
      console.error(error);
      console.error("Failed when calling Watson Discovery service");
    }

  });

}
// lz



module.exports = app;
