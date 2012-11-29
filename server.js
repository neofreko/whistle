HOST = null; // localhost
PORT = process.env.VMC_APP_PORT || 8001;

// when the daemon started
var starttime = (new Date()).getTime();

var mem = process.memoryUsage();
// every 10 seconds poll for the memory.
setInterval(function () {
  mem = process.memoryUsage();
}, 10*1000);


var fu = require("./fu"),
    sys = require("util"),
    url = require("url"),
    qs = require("querystring");

var MESSAGE_BACKLOG = 200,
    SESSION_TIMEOUT = 60 * 1000;

var channel = new function () {
  var messages = [],
      callbacks = [];

  this.appendMessage = function (nick, type, text) {
    var m = { nick: nick
            , type: type // "msg", "join", "part"
            , text: text
            , timestamp: (new Date()).getTime()
            };

    switch (type) {
      case "msg":
        sys.puts("<" + nick + "> " + text);
        break;
      case "queue":
        sys.puts("<" + nick + "> queue " + text);
        break;
      case "join":
        sys.puts(nick + " join");
        break;
      case "part":
        sys.puts(nick + " part");
        break;
    }

    messages.push( m );

    while (callbacks.length > 0) {
      callbacks.shift().callback([m]);
    }

    while (messages.length > MESSAGE_BACKLOG)
      messages.shift();
  };

  this.query = function (since, callback) {
    var matching = [];
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.timestamp > since)
        matching.push(message)
    }

    if (matching.length != 0) {
      callback(matching);
    } else {
      callbacks.push({ timestamp: new Date(), callback: callback });
    }
  };

  // clear old callbacks
  // they can hang around for at most 30 seconds.
  setInterval(function () {
    var now = new Date();
    while (callbacks.length > 0 && now - callbacks[0].timestamp > 30*1000) {
      callbacks.shift().callback([]);
    }
  }, 3000);
};

var welcomeMedia = "http://www.youtube.com/watch?v=0UIB9Y4OFPs";
var mediaPlaylist = [];
var currentDJSessionID = false;
var nowPlaying = false;

var sessions = {};
var sessions_length = 0;

function createSession (nick) {
  if (nick.length > 50) return null;
  if (/[^\w_\-^!]/.exec(nick)) return null;

  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.nick === nick) return null;
  }

  var session = { 
    nick: nick, 
    isDJ: sessions_length==0,
    id: Math.floor(Math.random()*99999999999).toString(),
    timestamp: new Date(),

    poke: function () {
      session.timestamp = new Date();
    },

    destroy: function () {
      channel.appendMessage(session.nick, "part");
      delete sessions[session.id];
    }
  };

  sys.puts('session length: ' + sessions.length)
  if (session.isDJ) {
    currentDJSessionID = session.id
    sys.puts("We got a DJ here: " + session.nick+"!")
  }

  sessions[session.id] = session;
  sessions_length++
  return session;
}

// interval to kill off old sessions
setInterval(function () {
  var now = new Date();
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];

    if (now - session.timestamp > SESSION_TIMEOUT) {
      session.destroy();
    }
  }
}, 1000);

fu.listen(Number(process.env.PORT || PORT), HOST);

fu.get("/", fu.staticHandler("index.html"));
fu.get("/style.css", fu.staticHandler("style.css"));
fu.get("/client.js", fu.staticHandler("client.js"));
fu.get("/jquery-1.2.6.min.js", fu.staticHandler("jquery-1.2.6.min.js"));
fu.get("/jwplayer/jwplayer.flash.swf", fu.staticHandler("jwplayer/jwplayer.flash.swf"));
fu.get("/jwplayer/jwplayer.html5.js", fu.staticHandler("jwplayer/jwplayer.html5.js"));
fu.get("/jwplayer/jwplayer.js", fu.staticHandler("jwplayer/jwplayer.js"));
fu.get("/css/bootstrap.min.css", fu.staticHandler("css/bootstrap.min.css"));
fu.get("/js/bootstrap.min.js", fu.staticHandler("js/bootstrap.min.js"));

function getNicks() {
  var nicks = [];
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];
    nicks.push(session.nick);
  }

  return nicks;
}

function pickNewDJ() {
  var idx = Math.floor(Math.random()*sessions.length);
  return sessions[idx].nick;

  currentDJSessionID = session.id;
}


fu.get("/who", function (req, res) {
  var nicks = getNicks();
  res.simpleJSON(200, { nicks: nicks
                      , rss: mem.rss
                      });
});

fu.get("/join", function (req, res) {
  var nick = qs.parse(url.parse(req.url).query).nick;
  if (nick == null || nick.length == 0) {
    res.simpleJSON(400, {error: "Bad nick."});
    return;
  }
  var session = createSession(nick);
  if (session == null) {
    res.simpleJSON(400, {error: "Nick in use"});
    return;
  }

  //sys.puts("connection: " + nick + "@" + res.connection.remoteAddress);
  // FIXME: use media from current playlist if availabl
  channel.appendMessage(session.nick, "join");
  res.simpleJSON(200, { id: session.id
                      , nick: session.nick
                      , rss: mem.rss
                      , starttime: starttime
                      , media: welcomeMedia
                      });
  sys.puts("tell client "+session.id+" to play " + welcomeMedia + "...");
});

fu.get("/part", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.destroy();
    sessions_length--;
  }
  var newDJ = pickNewDJ();
  channel.appendMessage('chatmaster', "msg", newDJ + ' is the new DJ. Yay!');
  res.simpleJSON(200, { rss: mem.rss });
});

fu.get("/recv", function (req, res) {
  if (!qs.parse(url.parse(req.url).query).since) {
    res.simpleJSON(400, { error: "Must supply since parameter" });
    return;
  }
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.poke();
  }

  var since = parseInt(qs.parse(url.parse(req.url).query).since, 10);

  channel.query(since, function (messages) {
    if (session) session.poke();
    res.simpleJSON(200, { messages: messages, rss: mem.rss });
  });
});

fu.get("/send", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;

  var session = sessions[id];
  if (!session || !text) {
    res.simpleJSON(400, { error: "No such session id" });
    return;
  }

  session.poke();

  var re=/(http:\/\/(www\.)?youtube\.com\/watch\?v=\S+)/;
  
  if (re.test(text)) {
        medias = re.exec(text);
        if (nowPlaying == false && mediaPlaylist.length==0)
            //skip playlist
            channel.appendMessage(session.nick, "play", medias[0])
        else {
            channel.appendMessage(session.nick, "queue", medias[0]);
            mediaPlaylist.push(medias[0]);
        }
  } else
    channel.appendMessage(session.nick, "msg", text);

  res.simpleJSON(200, { rss: mem.rss });
});

fu.get("/notify", function (req, res) {

  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;
  var session = sessions[id];
  
  switch (text) {
    case "media-next":
      sys.puts('sender session: ' + session.nick + ' ' + session.idDJ?'is DJ':'not DJ')
      if (id==currentDJSessionID) {
          if (mediaPlaylist.length>0) {
            var nextMedia = mediaPlaylist.shift();
            channel.appendMessage(session.nick, "play", nextMedia)
            nowPlaying = nextMedia;
            sys.puts("notify "+ text+": "+nextMedia);
        } else {
            nowPlaying = false;
            sys.puts("notify "+ text+": playlist is empty. Waiting for new media queue");
        }
      }
      break;
  }
  res.simpleJSON(200, { rss: mem.rss });
});
