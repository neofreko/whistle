HOST = null; // localhost
PORT = process.env.VMC_APP_PORT || 8001;

// when the daemon started
var starttime = (new Date()).getTime();

var mem = process.memoryUsage();
// every 10 seconds poll for the memory.
setInterval(function() {
    mem = process.memoryUsage();
}, 10 * 1000);


var fu = require("./fu"),
        sys = require("util"),
        url = require("url"),
        qs = require("querystring"),
        http = require("http")
        $ = require('jquery');

var MESSAGE_BACKLOG = 200,
        SESSION_TIMEOUT = 60 * 1000;

var channel = new function() {
    var messages = [],
            callbacks = [];

    this.appendMessage = function(nick, type, text) {
        var m = {nick: nick
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

        messages.push(m);

        while (callbacks.length > 0) {
            callbacks.shift().callback([m]);
        }

        while (messages.length > MESSAGE_BACKLOG)
            messages.shift();
    };

    this.query = function(since, callback) {
        var matching = [];
        for (var i = 0; i < messages.length; i++) {
            var message = messages[i];
            if (message.timestamp > since)
                matching.push(message)
        }

        if (matching.length != 0) {
            callback(matching);
        } else {
            callbacks.push({timestamp: new Date(), callback: callback});
        }
    };

    // clear old callbacks
    // they can hang around for at most 30 seconds.
    setInterval(function() {
        var now = new Date();
        while (callbacks.length > 0 && now - callbacks[0].timestamp > 30 * 1000) {
            callbacks.shift().callback([]);
        }
    }, 3000);
};

var welcomeMedia = 
//"http://www.youtube.com/watch?v=U7mPqycQ0tQ";
"http://ec-media.soundcloud.com/mS7BfTeKbteG.128.mp3?ff61182e3c2ecefa438cd02102d0e385713f0c1faf3b0339595666fe0c07e9176e2615f66b4feb65275988d14654226b9ba4f4a1634cc012c47e7d90a18b5bf067dadbbfa9&AWSAccessKeyId=AKIAJ4IAZE5EOI7PA7VQ&Expires=1354322349&Signature=eRBmOZuhrLOATaif9%2BptAgkg8zg%3D";
//http://www.youtube.com/watch?v=0UIB9Y4OFPs";
var mediaPlaylist = [];
var currentDJSessionID = false;
var nowPlaying = false;
var botMediaPlaylist = []

var sessions = {};
var sessions_length = 0;

function createSession(nick) {
    if (nick.length > 50)
        return null;
    if (/[^\w_\-^!]/.exec(nick))
        return null;

    for (var i in sessions) {
        var session = sessions[i];
        if (session && session.nick === nick)
            return null;
    }

    var session = {
        nick: nick,
        isDJ: sessions_length == 0,
        lastQueue: false,
        id: Math.floor(Math.random() * 99999999999).toString(),
        timestamp: new Date(),
        poke: function() {
            session.timestamp = new Date();
        },
        destroy: function() {
            channel.appendMessage(session.nick, "part");
            delete sessions[session.id];
        }
    };

    sys.puts('session length: ' + sessions.length)
    if (session.isDJ) {
        currentDJSessionID = session.id
        sys.puts("We got a DJ here: " + session.nick + "!")
    }

    sessions[session.id] = session;
    sessions_length++
    return session;
}

// interval to kill off old sessions
setInterval(function() {
    var now = new Date();
    for (var id in sessions) {
        if (!sessions.hasOwnProperty(id))
            continue;
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
fu.get("/plugin.js", fu.staticHandler("plugin.js"));
fu.get("/jquery-1.2.6.min.js", fu.staticHandler("jquery-1.2.6.min.js"));
fu.get("/jwplayer/jwplayer.flash.swf", fu.staticHandler("jwplayer/jwplayer.flash.swf"));
fu.get("/jwplayer/jwplayer.html5.js", fu.staticHandler("jwplayer/jwplayer.html5.js"));
fu.get("/jwplayer/jwplayer.js", fu.staticHandler("jwplayer/jwplayer.js"));
fu.get("/css/bootstrap.min.css", fu.staticHandler("css/bootstrap.min.css"));
fu.get("/js/bootstrap.min.js", fu.staticHandler("js/bootstrap.min.js"));

function getNicks() {
    var nicks = [];
    for (var id in sessions) {
        if (!sessions.hasOwnProperty(id))
            continue;
        var session = sessions[id];
        nicks.push(session.nick);
    }

    return nicks;
}

function pickNewDJ() {
    var idx = Math.floor(Math.random() * sessions.length);
    var session = sessions[idx].nick;
    
    currentDJSessionID = session.id;
}


fu.get("/who", function(req, res) {
    var nicks = getNicks();
    res.simpleJSON(200, {nicks: nicks
                , rss: mem.rss
    });
});

fu.get("/join", function(req, res) {
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
    var media = nowPlaying != false? nowPlaying : welcomeMedia;
    res.simpleJSON(200, {id: session.id
                , nick: session.nick
                , rss: mem.rss
                , starttime: starttime
                , media: media
    });
    sys.puts("tell client " + session.id + " to play " + media + "...");
});

fu.get("/part", function(req, res) {
    var id = qs.parse(url.parse(req.url).query).id;
    var session;
    if (id && sessions[id]) {
        session = sessions[id];
        session.destroy();
        sessions_length--;
    }
    var newDJ = pickNewDJ();
    channel.appendMessage('chatmaster', "msg", newDJ + ' is the new DJ. Yay!');
    res.simpleJSON(200, {rss: mem.rss});
});

fu.get("/recv", function(req, res) {
    if (!qs.parse(url.parse(req.url).query).since) {
        res.simpleJSON(400, {error: "Must supply since parameter"});
        return;
    }
    var id = qs.parse(url.parse(req.url).query).id;
    var session;
    if (id && sessions[id]) {
        session = sessions[id];
        session.poke();
    }

    var since = parseInt(qs.parse(url.parse(req.url).query).since, 10);

    channel.query(since, function(messages) {
        if (session)
            session.poke();
        res.simpleJSON(200, {messages: messages, rss: mem.rss});
    });
});

fu.get("/send", function(req, res) {
    var id = qs.parse(url.parse(req.url).query).id;
    var text = qs.parse(url.parse(req.url).query).text;

    var session = sessions[id];
    if (!session || !text) {
        res.simpleJSON(400, {error: "No such session id"});
        return;
    }

    session.poke();

    var media_resolvers = [
        {
            re: /(http(s*):\/\/(www\.)?youtube\.com\/watch\?v=\S+)/,
            resolver: function(text_url, callback) {
                var medias = /(http(s*):\/\/(www\.)?youtube\.com\/watch\?v=\S+)/.exec(text_url)
                callback(medias[0])
            }
        },
        {
    //http://soundcloud.com/runtlalala/dont-know-why-norah-jones
            re: /(http:\/\/soundcloud\.com\/\S+?\/\S+)/,
            resolver: function(text_url, callback) {
                var medias = /(http:\/\/soundcloud\.com\/\S+?\/\S+)/.exec(text_url)
                sys.puts('http://api.soundcloud.com/resolve.json?url=' + medias[0] + '&client_id=7752b2872de45cce9104b6feaa1e3582')
                $.ajax({
                    url: 'http://api.soundcloud.com/resolve.json?url=' + medias[0] + '&client_id=7752b2872de45cce9104b6feaa1e3582',
                    dataType: 'json',
                    success: function(data) {
                        sys.puts('got data from soundcloud')
                        console.log(data)
                        callback(data.stream_url)
                    },
                    error: function (jqxhr, errorStatus, errorThrown) {
                        sys.puts('error resolving soundcloud url: '+jqxhr.responseText)
                    },
                    statusCode: {
                        302: function(jqxhr, errorStatus, errorThrown) {
                            var new_location = $.parseJSON(jqxhr.responseText);
                            sys.puts('new location: ' + new_location.location)
                            $.ajax({
                                url: new_location.location,
                                dataType: 'json',
                                success: function(data) {
                                    sys.puts('Will fetch playable URL from: '+data.stream_url+'?client_id=7752b2872de45cce9104b6feaa1e3582')
                                    // but jwplayer cannot handle the redirect, so we'll gonna help it fetch the real stream url
                                    var surl = url.parse(data.stream_url+'?client_id=7752b2872de45cce9104b6feaa1e3582')
                                    http.get({host: surl.host, path: surl.path}, function(res) {
                                      console.log("Got response: " + res.statusCode);

                                      for(var item in res.headers) {
                                        console.log(item + ": " + res.headers[item]);
                                      }
                                      console.log('Yay, REAL soundcloud jwplayer-playable url: ', res.headers['location'])
                                      callback(res.headers['location']);
                                    }).on('error', function(e) {
                                      console.log("Got error: " + e.message);
                                    });
                                }
                            })
                        }
                    }
                });
            }
        },
    ]

    var media_resolver_callback = function(media) {
        console.log('nowPlaying: ', nowPlaying, ' playlist: ', mediaPlaylist.length,' items')
        if (nowPlaying == false && mediaPlaylist.length == 0) {
            //skip playlist
            channel.appendMessage(session.nick, "play", media)
            nowPlaying = media
        } else {
            channel.appendMessage(session.nick, "queue", media);
            mediaPlaylist.push(media);
        }
    }

    var resolved = false
    for (idx in media_resolvers) {
        var re = media_resolvers[idx]
        console.log(re)
        if (re.re.test(text)) {
            var diff = (session.lastQueue - new Date())/1000
            console.log('lastQueue: ', session.lastQueue, ' diff: ',diff,' seconds')
            var canQueue = (session.lastQueue == false) || (session.lastQueue && diff > 2) || mediaPlaylist.length==0// two second ban
            if (canQueue) {
                media = re.resolver(text, media_resolver_callback)
                resolved = true
                session.lastQueue = new Date();
            } else {
                channel.appendMessage('chatmaster', 'msg', session.nick + ', no queue flooding please')
                resolved = true
            }

            break
        }
    }
    if (!resolved)
        channel.appendMessage(session.nick, "msg", text);

    res.simpleJSON(200, {rss: mem.rss});
});

fu.get("/notify", function(req, res) {

    var id = qs.parse(url.parse(req.url).query).id;
    var text = qs.parse(url.parse(req.url).query).text;
    var session = sessions[id];

    console.log('>> /notify/', text)

    switch (text) {
        case "media-next":
            if (session)
                sys.puts('sender session: ' + session.nick + ' ' + session.idDJ ? 'is DJ' : 'not DJ')
            if (id == currentDJSessionID) {
                if (mediaPlaylist.length > 0) {
                    var nextMedia = mediaPlaylist.shift();
                    channel.appendMessage(session.nick, "play", nextMedia)
                    nowPlaying = nextMedia;
                    sys.puts("notify " + text + ": " + nextMedia);
                } else {
                    if (botMediaPlaylist.length > 0) {
                        var nextMedia = botMediaPlaylist.shift();
                        channel.appendMessage(session.nick, "play", JSON.stringify({file: nextMedia.url, type: 'mp3'}))
                        nowPlaying = nextMedia.url;
                        console.log('playing media from botMediaPlaylist: ', nextMedia.title, ' - ', nextMedia.artist)
                        console.log('botmp.length: ', botMediaPlaylist.length)
                        if (botMediaPlaylist.length == 0) {
                            console.log(nextMedia.similar_artists)
                            if (nextMedia.similar_artists.length>0) 
                                populateBotMediaPlaylist(nextMedia.similar_artists[Math.floor(Math.random()*nextMedia.similar_artists.length)])
                        }
                    } else {
                        nowPlaying = false;
                        sys.puts("notify " + text + ": playlist is empty. Waiting for new media queue");
                        channel.appendMessage('chatmaster', 'msg', 'Playlist is empty, queue some more!')
                    }
                }
            }
            break;
    }

    res.simpleJSON(200, {rss: mem.rss});
});

function populateBotMediaPlaylist(keyword) {
    console.log('About to populate botMediaPlaylist using keyword: ', keyword)
    //http://ex.fm/api/v3/song/search/silverchair
    $.ajax({
        url: 'http://ex.fm/api/v3/song/search/'+keyword,
        dataType: 'json',
        success: function(data) {
            botMediaPlaylist = [];
            for(var i=0;i<data.songs.length;i++) {
                var song = data.songs[i]
                if (/api\.soundcloud\.com/.test(song.url))
                    continue; // we'll handle it later
                botMediaPlaylist.push(song);
                console.log('queued: ', song.title, ' from ', song.artist)
                //if (i==1) break;
            }
        },
        error: function() {
            console.log('Cannot search exfm');
        }
    })
}

fu.get("/bot-start", function(req, res) {
    var keyword = qs.parse(url.parse(req.url).query).k;

    populateBotMediaPlaylist(keyword)

    res.simpleJSON(200, {rss: mem.rss});
})
