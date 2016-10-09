var restify = require('restify');
var builder = require('botbuilder');
var request = require("request");

var user_details = {};

Date.prototype.addHours = function(h) {    
   this.setTime(this.getTime() + (h*60*60*1000)); 
   return this;   
}

function unbabel_submit(ub_text, ub_srclng, ub_destlng, callback2){
	var options = {
	  url: 'https://sandbox.unbabel.com/tapi/v2/mt_translation/',
	  method: 'POST',
	  headers: {
		'Authorization': 'ApiKey pixels.camp.524:17c75d079159cf27e97bf4b3bffbadbe1f93e808',
		'Content-Type': 'application/json'
	  },
	  json: {
		"text" : ub_text, "target_language" : ub_destlng, "text_format" : "text", "source_language" : ub_srclng
	  }

	};
	
	function callback(error, response, body) {
		//console.log(body);
		//throw new Error("my error message");
		if(body.status=='machine_translate_in_progress'){
			//SUCCESS!
			callback2(body.uid);
		}
	}
	request(options, callback);
}

function unbabel_get_result(uid, callback2){
	var options = {
	  url: 'http://sandbox.unbabel.com/tapi/v2/mt_translation/'+uid+'/',
	  method: 'GET',
	  headers: {
		'Authorization': 'ApiKey pixels.camp.524:17c75d079159cf27e97bf4b3bffbadbe1f93e808',
		'Content-Type': 'application/json'
	  },
	};
	
	function callback(error, response, body) {
		if(JSON.parse(body).status=='deliver_ok'){
			clearInterval(t);
			callback2(JSON.parse(body).translatedText);
		}
	}
	var t=setInterval(function() {
		request(options, callback)
	}, 1000);
	
}

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

var model = 'https://api.projectoxford.ai/luis/v1/application?id=5b7519cd-cb65-4df3-9cc0-2cd63dae7e66&subscription-key=79481a16eeee4c569b68d60431dcd4d0';
var recognizer = new builder.LuisRecognizer(model);
var dialog = new builder.IntentDialog({ 
    recognizeMode: builder.RecognizeMode.onBegin,
    recognizers: [recognizer]
});

dialog.onBegin(function (session, args, next) {
    next();
});

bot.dialog('/', dialog);

dialog.matches('TvProgramming', [
    function (session, args, next) {
        var channel = builder.EntityRecognizer.findEntity(args.entities, 'Channel');
        var time = builder.EntityRecognizer.resolveTime(args.entities);
        session.dialogData.program = time;
        if (!channel) {
            var msg = "What is the channel?";
            if (user_details.lang == "pt")
                msg = "Qual é o canal?";
            builder.Prompts.text(session, msg);
            session.dialogData.channelQuery = session.message.text;
        } else {
            session.dialogData.channelQuery = channel.entity;
            next({
                response: channel.entity
            });
        }
    },
    function (session, results) {
        var finalTime = new Date(session.dialogData.program);
        if (results.response) {
            (function seeDay(channel, beginDate) {
                var day = [];
                var channels = new Map();
                request("http://nos-brpx.northeurope.cloudapp.azure.com/EPGRepositories/EPGCatalog.svc/Channel?$format=json", function (error, response, item) {
                    if (!error && response.statusCode == 200) {
                        var channelsf = JSON.parse(item).value;
                        /*//console.log(channelsf);
                         channelsf.forEach(function(channel) {
                         channels.set(channel.Name.toLowerCase().replace(" ", ""), channel.ChannelId);
                         })
                         }*/
                        var min = {
                            value: 20,
                            channels: [{
                                id: 0,
                                name: ""
                            }]
                        };
                        var channelQuery = session.dialogData.channelQuery;
                        channelsf.forEach(function (channel) {
                            var entry = channel.Name.toLowerCase().replace(" ", "");
                            if (entry.indexOf(channelQuery) !== -1) {
                                if (entry.length < min.value) {
                                    min.value = entry.length;
                                    min.channels = [];
                                    min.channels.push({
                                        name: entry,
                                        id: channel.ChannelId
                                    });
                                }else{
                                    if (entry.length == min.value) {
                                        min.channels.push({
                                            name: entry,
                                            id: channel.ChannelId
                                        });
                                    }
                                }
                            }
                        });
                        console.log("Found "+min.channels.length+" channels");
                        var channelResult = "";
                        if (min.channels.length > 1) {
                            var str = "";
                            min.channels.forEach(function (channel) {
                                str += "\n" + channel.name;
                            });
                            if (user_details.lang == "en") {
                                session.send("Please be more specific in the channel, we found this channels:" + str);
                            } else {
                                session.send("Por favor sê mais especifico:" + str);
                            }
                            return;
                        }
                        if (min.channels.length == 1) {
                            channelResult = min.channels[0].id;
                        }
                        if (min.channels.length == 0) {
                            if (user_details.lang == "en") {
                                session.send("We couldn't find that channel!");
                            } else {
                                session.send("Não encontramos esse canal!");
                            }
                            return;
                        }
                    }
                    console.log("CHANNEL TO SEARCH: " + channelResult);
                    request("http://nos-brpx.northeurope.cloudapp.azure.com/EPGRepositories/EPGCatalog.svc/Event?$format=json&$filter=ServiceId%20eq%20%27" + channelResult + "%27%20and%20UtcBeginDate%20ge%20datetime%27" + beginDate.toISOString() + "%27%20and%20UtcEndDate%20lt%20datetime%27" + beginDate.addHours(6).toISOString() + "%27&$expand=Program", function (error, response, item) {
                        if (!error && response.statusCode == 200) {
                            var programs = JSON.parse(item).value;
                            programs.sort(function (a, b) {
                                return new Date(a.UtcBeginDate) - new Date(b.UtcBeginDate);
                            });
                            programs.forEach(function (program) {
                                var str = "";
                                var date = new Date(program.UtcBeginDate);
                                str += ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2) + " -";
                                str += " " + program.Program.Title;
                                if (program.Program.OriginalTitle != "" && program.Program.Title != program.Program.OriginalTitle) {
                                    str += " (" + program.Program.OriginalTitle + ")";
                                }
                                if (program.Program.GenresDisplay == "Séries") {
                                    str += " T" + program.Program.Season + " E" + program.Program.Episode;
                                }
                                day.push(str);
                            });
                        } else {
                            console.log('An error occurred.');
                        }
                        session.send(JSON.stringify(day).split(",").join("\n\n").replace("[", "").replace("]", ""));
                    });
                });
            }(results.response, finalTime));
        } else {
            session.send("Ok");
        }
    }
]);

dialog.matches('Weather', [
    function(session, args, next) {
        var location = builder.EntityRecognizer.findEntity(args.entities, 'Place');

        if (!location) {
            var msg = "What is the location?";
            if(user_details.lang == "pt")
              msg ="Qual é a localização?";
            builder.Prompts.text(session, msg);
        } else {
            next({
                response: location.entity
            });
        }
    },
    function(session, results) {
        if (results.response) {

            request('http://maps.google.com/maps/api/geocode/json?address=' + results.response, function(error, response, loc) {
                if (!error && response.statusCode == 200) {
                    request('https://api.darksky.net/forecast/95387f12434abcb72c983150ec9b7ab7/' + JSON.parse(loc).results[0].geometry.location.lat + "," +
                        JSON.parse(loc).results[0].geometry.location.lng,
                        function(error, response, item) {
                            var msg = "Currently the weather is  " + JSON.parse(item).currently.summary.toLowerCase() + " and the probability of rain is: " + JSON.parse(item).currently.precipProbability + "%";
                            if(user_details.lang=="pt")
                                unbabel_submit(msg, 'en', 'pt', function(retorno){
                                    unbabel_get_result(retorno, function(resultado){
                                        session.send(resultado);
                                    });
                                });
                            else 
                                session.send(msg);

                        });
                } else {
                    console.log(error);
                }
            });
        } else {
            session.send("Ok");
        }
    }
]);

dialog.matches('ProductPrice', [
    function(session, args, next) {
        var product = builder.EntityRecognizer.findEntity(args.entities, 'Product');
        if (!product) {
            var msg = "What is the product name?";
            if(user_details.lang == "pt")
              msg ="Qual é o produto?";
            builder.Prompts.text(session, msg);
        } else {
            next({
                response: product.entity
            });
        }
    },
    function(session, results) {
        if (results.response) {
            request("http://apicolpixelcamp.azure-api.net//api/search?query=" + results.response + "&productsToRetrieve=20", function(error, response, item) {
                if (!error && response.statusCode == 200) {
                    var products = JSON.parse(item).ProductsFound;
                    if (products.length === 0) {
                        session.send('No products found for that keyword!');
                    }
                    suggestions = 5;
                    if (products.length < 5) {
                        suggestions = products.length;
                    }
                    var used_indexes = [];
                    response = "";
                    for (i = 0; i < suggestions; i++) {
                        do {
                            a = Math.floor((Math.random() * products.length) + 1);
                            //console.log(a);
                            //console.log(used_indexes);
                        }
                        while (!used_indexes.indexOf(a));
                        used_indexes.push(a);
                        response += (i + 1 + '.º ' + products[a].ProductBrand + " - " + products[a].ProductWebDisplayName + " - " + products[a].ProductOriginalListPrice + '€\n\n');
                    }
                    session.send(response);
                }
            });
        } else {
            session.send("Ok");
        }
    }
]);

dialog.matches('Greeting', [
    function (session) {
        builder.Prompts.text(session, "Hello! What is your favorite language?(answer: en) \n\n Olá! Qual é a tua lingua favorita? (responde: pt)");
    },
    function (session, results, next) {
        if (results.response) {
            user_details.lang = results.response;
            session.dialogData.lang = results.response;
            if(session.dialogData.lang == "pt"){
                builder.Prompts.text(session, "Como te chamas?");
            }
            else {
                builder.Prompts.text(session, "What is your name?");
            }
            
        } else {
            next();
        }
    },
    function (session, results) {
        if (results.response) {
           user_details.name = results.response;
           session.dialogData.name = results.response;
        }
        if(user_details.lang == "pt"){
            session.send("Como posso ser útil, " + user_details.name + " ?");
        }
        else{
            session.send("How can I be useful, " + user_details.name + " ?");
        }
        
    }
]);

dialog.onDefault(
    [function (session) {
        if(session.dialogData.lang == "pt"){
            var textvar = session.message.text;
            console.log("in:  "+textvar)
            unbabel_submit(textvar, 'pt', 'en', function(retorno){
                unbabel_get_result(retorno, function(resultado){
                    console.log(resultado);

                    session.messsage = resultado;
                
                    console.log("sess: " + session.messsage.text);
                    session.replaceDialog('/');
                    next();
                });
            })
        } else {
            session.send("Sorry, couldn't understand that.");
        }
    }]
);
