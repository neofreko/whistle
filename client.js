var CONFIG = { debug: false
             , nick: "#"   // set in onConnect
             , id: null    // set in onConnect
             , last_message_time: 1
             , focus: true //event listeners bound in onConnect
             , unread: 0 //updated in the message-processing loop
             };

var nicks = [];

//  CUT  ///////////////////////////////////////////////////////////////////
/* This license and copyright apply to all code until the next "CUT"
http://github.com/jherdman/javascript-relative-time-helpers/

The MIT License

Copyright (c) 2009 James F. Herdman

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


 * Returns a description of this past date in relative terms.
 * Takes an optional parameter (default: 0) setting the threshold in ms which
 * is considered "Just now".
 *
 * Examples, where new Date().toString() == "Mon Nov 23 2009 17:36:51 GMT-0500 (EST)":
 *
 * new Date().toRelativeTime()
 * --> 'Just now'
 *
 * new Date("Nov 21, 2009").toRelativeTime()
 * --> '2 days ago'
 *
 * // One second ago
 * new Date("Nov 23 2009 17:36:50 GMT-0500 (EST)").toRelativeTime()
 * --> '1 second ago'
 *
 * // One second ago, now setting a now_threshold to 5 seconds
 * new Date("Nov 23 2009 17:36:50 GMT-0500 (EST)").toRelativeTime(5000)
 * --> 'Just now'
 *
 */
Date.prototype.toRelativeTime = function(now_threshold) {
  var delta = new Date() - this;

  now_threshold = parseInt(now_threshold, 10);

  if (isNaN(now_threshold)) {
    now_threshold = 0;
  }

  if (delta <= now_threshold) {
    return 'Just now';
  }

  var units = null;
  var conversions = {
    millisecond: 1, // ms    -> ms
    second: 1000,   // ms    -> sec
    minute: 60,     // sec   -> min
    hour:   60,     // min   -> hour
    day:    24,     // hour  -> day
    month:  30,     // day   -> month (roughly)
    year:   12      // month -> year
  };

  for (var key in conversions) {
    if (delta < conversions[key]) {
      break;
    } else {
      units = key; // keeps track of the selected key over the iteration
      delta = delta / conversions[key];
    }
  }

  // pluralize a unit when the difference is greater than 1.
  delta = Math.floor(delta);
  if (delta !== 1) { units += "s"; }
  return [delta, units].join(" ");
};

/*
 * Wraps up a common pattern used with this plugin whereby you take a String
 * representation of a Date, and want back a date object.
 */
Date.fromString = function(str) {
  return new Date(Date.parse(str));
};

//  CUT  ///////////////////////////////////////////////////////////////////



//updates the users link to reflect the number of active users
function updateUsersLink ( ) {
  var t = nicks.length.toString() + " user";
  if (nicks.length != 1) t += "s";
  $("#usersLink").text(t);
}

//handles another person joining chat
function userJoin(nick, timestamp) {
  //put it in the stream
  addMessage(nick, "joined", timestamp, "join");
  //if we already know about this user, ignore it
  for (var i = 0; i < nicks.length; i++)
    if (nicks[i] == nick) return;
  //otherwise, add the user to the list
  nicks.push(nick);
  //update the UI
  updateUsersLink();
}

//handles someone leaving
function userPart(nick, timestamp) {
  //put it in the stream
  addMessage(nick, "left", timestamp, "part");
  //remove the user from the list
  for (var i = 0; i < nicks.length; i++) {
    if (nicks[i] == nick) {
      nicks.splice(i,1)
      break;
    }
  }
  //update the UI
  updateUsersLink();
}

// utility functions

util = {
  urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g, 

  //  html sanitizer 
  toStaticHTML: function(inputHtml) {
    inputHtml = inputHtml.toString();
    return inputHtml.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
  }, 

  //pads n with zeros on the left,
  //digits is minimum length of output
  //zeroPad(3, 5); returns "005"
  //zeroPad(2, 500); returns "500"
  zeroPad: function (digits, n) {
    n = n.toString();
    while (n.length < digits) 
      n = '0' + n;
    return n;
  },

  //it is almost 8 o'clock PM here
  //timeString(new Date); returns "19:49"
  timeString: function (date) {
    var minutes = date.getMinutes().toString();
    var hours = date.getHours().toString();
    return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes);
  },

  //does the argument only contain whitespace?
  isBlank: function(text) {
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  }
};

//used to keep the most recent messages visible
function scrollDown () {
  window.scrollBy(0, document.height);
  $("#entry").focus();
}

//inserts an event into the stream for display
//the event may be a msg, join or part type
//from is the user, text is the body and time is the timestamp, defaulting to now
//_class is a css class to apply to the message, usefull for system events
function addMessage (from, text, time, _class) {
  if (text === null)
    return;

  if (time == null) {
    // if the time is null or undefined, use the current time.
    time = new Date();
  } else if ((time instanceof Date) === false) {
    // if it's a timestamp, interpret it
    time = new Date(time);
  }

  //every message you see is actually a table with 3 cols:
  //  the time,
  //  the person who caused the event,
  //  and the content
  var messageElement = $(document.createElement("table")).attr('id', 't_' + time.getTime());

  messageElement.addClass("message");
  if (_class)
    messageElement.addClass(_class);

  // sanitize
  text = util.toStaticHTML(text);

  // If the current user said this, add a special css class
  var nick_re = new RegExp(CONFIG.nick);
  if (nick_re.exec(text))
    messageElement.addClass("personal");

  // replace URLs with links
  text = text.replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');

  var content = '<tr>'
              + '  <td class="date">' + util.timeString(time) + '</td>'
              + '  <td class="nick">' + util.toStaticHTML(from) + '</td>'
              + '  <td class="msg-text">' + text  + '</td>'
              + '</tr>'
              ;
  messageElement.html(content);

  //the log is the stream that we view
  $("#log").append(messageElement);
  $('#'+'t_' + time.getTime()).embedly(); /// embedly

  //always view the most recent message when it is added
  scrollDown();
}

function updateRSS () {
  var bytes = parseInt(rss);
  if (bytes) {
    var megabytes = bytes / (1024*1024);
    megabytes = Math.round(megabytes*10)/10;
    $("#rss").text(megabytes.toString());
  }
}

function updateUptime () {
  if (starttime) {
    $("#uptime").text(starttime.toRelativeTime());
  }
}

var transmission_errors = 0;
var first_poll = true;


//process updates if we have any, request updates from the server,
// and call again with response. the last part is like recursion except the call
// is being made from the response handler, and not at some point during the
// function's execution.
function longPoll (data) {
  if (transmission_errors > 2) {
    showConnect();
    return;
  }

  if (data && data.rss) {
    rss = data.rss;
    updateRSS();
  }

  //process any updates we may have
  //data will be null on the first call of longPoll
  if (data && data.messages) {
    for (var i = 0; i < data.messages.length; i++) {
      var message = data.messages[i];

      //track oldest message so we only request newer messages from server
      if (message.timestamp > CONFIG.last_message_time)
        CONFIG.last_message_time = message.timestamp;

      //dispatch new messages to their appropriate handlers
      switch (message.type) {
        case "msg":
          if(!CONFIG.focus){
            CONFIG.unread++;
          }
          addMessage(message.nick, message.text, message.timestamp);
          break;

        case "join":
          userJoin(message.nick, message.timestamp);
          break;

        case "part":
          userPart(message.nick, message.timestamp);
          break;

        case "queue":
          /*var playlist = jwplayer().getPlaylist();
          var newItem = {
              file: message.text
          };
          playlist.push(newItem);
          jwplayer().load(playlist);*/

          // display
          if(!CONFIG.focus){
            CONFIG.unread++;
          }
          addMessage(message.nick, '[queue] '+message.text, message.timestamp);
          break;

        case "play":
          if(!CONFIG.focus){
            CONFIG.unread++;
          }
          var newItem = null
          
          try {
            newItem = $.parseJSON(message.text)
          } catch (e) {
            newItem = {
                file: message.text
            };
          }

          addMessage(message.nick, '[play] '+newItem.file, message.timestamp);
          
          jwplayer().play(false).load(newItem).onError(function(message) {
      console.log('Error: ', message, ', sending media-next')
      notify('media-next')
  }).play(true)
          break;
      }
    }
    //update the document title to include unread message count if blurred
    updateTitle();

    //only after the first request for messages do we want to show who is here
    if (first_poll) {
      first_poll = false;
      who();
    }
  }

  //make another request
  $.ajax({ cache: false
         , type: "GET"
         , url: "/recv"
         , dataType: "json"
         , data: { since: CONFIG.last_message_time, id: CONFIG.id }
         , error: function () {
             // FIXME: if error is bad session, make it auto rejoin
             addMessage("", "long poll error. trying again...", new Date(), "error");
             transmission_errors += 1;
             //don't flood the servers on error, wait 10 seconds before retrying
             setTimeout(longPoll, 10*1000);
           }
         , success: function (data) {
             transmission_errors = 0;
             //if everything went well, begin another request immediately
             //the server will take a long time to respond
             //how long? well, it will wait until there is another message
             //and then it will return it to us and close the connection.
             //since the connection is closed when we get data, we longPoll again
             longPoll(data);
           }
         });
}

//submit a new message to the server
function send(msg) {
    var cur_msg = msg;
  if (CONFIG.debug === false) {
    // XXX should be POST
    // XXX should add to messages immediately
    //jQuery.get("/send", {id: CONFIG.id, text: msg}, function (data) { }, "json");
    jQuery.ajax({
        url: '/send',
        data: {id: CONFIG.id, text: msg},
        method: 'GET',
        dataType: 'json',
        success: function (data) {},
        error: function (xhr, textStatus, errorThrown) {
            var err = jQuery.parseJSON(xhr.responseText);
            addMessage('<<', 'message not sent: ' + cur_msg, new Date().getTime(), 'error');
            if (err.error == 'No such session id' && !CONFIG.isRejoining) {
                CONFIG.isRejoining = true;
                setTimeout(function () {
                    joinAs(CONFIG.nick); CONFIG.isRejoining = false;
                }, 1000);
            } else
                console.log(err);
        }
    });
  }
}

function notify(msg) {
  jQuery.get("/notify", {id: CONFIG.id, text: msg}, function (data) { }, "json");
}

//Transition the page to the state that prompts the user for a nickname
function showConnect () {
  $("#connect").show();
  $("#loading").hide();
  $("#toolbar").hide();
  $("#nickInput").focus();
}

//transition the page to the loading screen
function showLoad () {
  $("#connect").hide();
  $("#loading").show();
  $("#toolbar").hide();
}

//transition the page to the main chat view, putting the cursor in the textfield
function showChat (nick) {
  $("#toolbar").show();
  $("#entry").focus();

  $("#connect").hide();
  $("#loading").hide();

  scrollDown();
}

//we want to show a count of unread messages when the window does not have focus
function updateTitle(){
  if (CONFIG.unread) {
    document.title = "(" + CONFIG.unread.toString() + ") Pour some sugar on me";
  } else {
    document.title = "Pour some sugar on me";
  }
}

// daemon start time
var starttime;
// daemon memory usage
var rss;

//handle the server's response to our nickname and join request
function onConnect (session) {
  if (session.error) {
    alert("error connecting: " + session.error);
    showConnect();
    return;
  }

  CONFIG.nick = session.nick;
  CONFIG.id   = session.id;
  starttime   = new Date(session.starttime);
  rss         = session.rss;
  media       = session.media;

  updateRSS();
  updateUptime();

  //update the UI to show the chat
  showChat(CONFIG.nick);

  //listen for browser events so we know to update the document title
  $(window).bind("blur", function() {
    CONFIG.focus = false;
    updateTitle();
  });

  $(window).bind("focus", function() {
    CONFIG.focus = true;
    CONFIG.unread = 0;
    updateTitle();
  });

  // FIXME: possible stacked event on rejoin session
  
  // play it loud baby!
  jwplayer('cjwplayer').setup({
        'modes': [
                    { type: 'html5' },
                    { type: 'flash' },
                    { type: 'download'}
                ],
        file: media,
        width: "480",
        //height: "640",
        controls: true,
        autostart: true
        /*listbar: {
            position: 'right',
            //size: 320
        },*/
  });
  jwplayer('cjwplayer').onComplete(function() {
    console.log('next song please')
    // notify server
    notify('media-next')
  });
  jwplayer('cjwplayer').onError(function(message) {
      console.log('Error: ', message, '. sending media-next')
      notify('media-next')
  })

  jwplayer().player.addEventListener() 
  
  //window.setTimeout("console.log('rock on!'); jwplayer().play()", 100);
}

//add a list of present chat members to the stream
function outputUsers () {
  var nick_string = nicks.length > 0 ? nicks.join(", ") : "(none)";
  addMessage("users:", nick_string, new Date(), "notice");
  return false;
}

//get a list of the users presently in the room, and add it to the stream
function who () {
  jQuery.get("/who", {}, function (data, status) {
    if (status != "success") return;
    nicks = data.nicks;
    outputUsers();
  }, "json");
}

function joinAs(nick) {
  $.ajax({ cache: false
           , type: "GET" // XXX should be POST
           , dataType: "json"
           , url: "/join"
           , data: { nick: nick }
           , error: function (xhr, errorStatus, errorThrown) {
               var err = $.parseJSON(xhr.responseText)
               alert("Error: " + err.error);
               showConnect();
             }
           , success: onConnect
           });
}

$(document).ready(function() {

  //submit new messages when the user hits enter if the message isnt blank
  $("#entry").keypress(function (e) {
    if (e.keyCode != 13 /* Return */) return;
    var msg = $("#entry").attr("value").replace("\n", "");
    if (!util.isBlank(msg)) send(msg);
    $("#entry").attr("value", ""); // clear the entry field.
  });

  $("#usersLink").click(outputUsers);

  //try joining the chat when the user clicks the connect button
  $("#connectButton").click(function () {
    //lock the UI while waiting for a response
    showLoad();
    var nick = $("#nickInput").attr("value");

    //dont bother the backend if we fail easy validations
    if (nick.length > 50) {
      alert("Nick too long. 50 character max.");
      showConnect();
      return false;
    }

    //more validations
    if (/[^\w_\-^!]/.exec(nick)) {
      alert("Bad character in nick. Can only have letters, numbers, and '_', '-', '^', '!'");
      showConnect();
      return false;
    }

    //make the actual join request to the server
    joinAs(nick);
    return false;
  });

  // update the daemon uptime every 10 seconds
  setInterval(function () {
    updateUptime();
  }, 10*1000);

  if (CONFIG.debug) {
    $("#loading").hide();
    $("#connect").hide();
    scrollDown();
    return;
  }

  // remove fixtures
  $("#log table").remove();

  //begin listening for updates right away
  //interestingly, we don't need to join a room to get its updates
  //we just don't show the chat stream to the user until we create a session
  longPoll();

  showConnect();
});

//if we can, notify the server that we're going away.
$(window).unload(function () {
  jQuery.get("/part", {id: CONFIG.id}, function (data) { }, "json");
});
