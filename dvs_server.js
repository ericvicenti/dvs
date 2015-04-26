#!/usr/bin/env node

var level = require('level');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var express = require('express');
var exec = require('child_process').execFile;
var execSync = require('child_process').execFileSync;
var getGistIdentities = require('./getGistIdentities');
var md5 = require('MD5');
var path = require('path');

var HOME_DIR = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var SERVER_PORT = 8288;
var MY_PEER_ID = null;

var AUTH_GIST_ID = '9f533902a95f15d2f46a';
var app = express();

var DVS_DIR = path.join(HOME_DIR, '.dvs');
execSync('mkdir', ['-p', DVS_DIR]);
var db = level(path.join(DVS_DIR, 'db'));
var peers = {};
var identities = {};

var tasks = [];

var log = console.log;

function schedule(name, params) {
  log('Scheduling task '+name+' with params ', params);
  tasks.push({
    name: name,
    params: params
  });
}

function runTask() {
  // log('Running a task')
  var task = tasks.shift();
  if (!task) {
    // log('No task to run');
    setTimeout(function() {
      runTask();
    }, 500);
    return;
  }
  var cb = function() {
    // log('Task done. Running another');
    runTask();
  }
  switch(task.name) {
    case 'introducePeer':
      return introducePeer(task.params, cb);
    case 'fetchPeers':
      return fetchPeers(task.params, cb);
    case 'loadIdentities':
      return loadIdentities(task.params, cb);
    case 'fetchGhIdentities':
      return fetchGhIdentities(task.params, cb);
    default:
      log('unknown task!! '+task.name);
      cb();
  }
}

function introducePeer(params, cb) {
  log('Introducing peer ', params);
  var me = peers[MY_PEER_ID];
  dvsPost(params.peerId, 'peers', {host: me[0], port: me[1]}, function(err) {
    if (err) return cb(err);
    schedule('fetchPeers', {peerId: params.peerId});
    cb();
  });
}

function fetchPeers(params, cb) {
  log('Fetching peers ', params);
  dvsGet(params.peerID, 'peers', function(err, remotePeers) {
    if (err) return cb(err);
    Object.keys(remotePeers).forEach(function(remotePeerId) {
      if (!peers[remotePeerId]) {
        peers[remotePeerId] = remotePeers[remotePeerId];
        schedule('introducePeer', {peerId: remotePeerId})
      }
    });
    cb();
  });
}

function fetchGhIdentities(params, cb) {
  log('Getting github identities');
  getGistIdentities(AUTH_GIST_ID, function(err, ids) {
    identities = ids;
    if (err) {
      log('Github identity fetch failed!', err);
      cb();
      return;
    }
    db.put('verified_ids', JSON.stringify(ids), function(err) {
      if (err) {
        log('Github identity saving failed!');
        cb();
        return;
      }
      setTimeout(function() {
        schedule('fetchGhIdentities');
      }, 1 * 60 * 60 * 1000) // re-fetch every 1hr
      cb();
    });
  });
}

function loadIdentities(params, cb) {
  log('Loading identities from db');
  db.get('verified_ids', function(err, resp) {
    if (err) {
      log('Identity fetch failed!');
      cb();
      return;
    }
    identities = JSON.parse(resp);
    log('Identities fetched!', err);
    cb();
  });
}

function getPeerUrl(peerId) {
  var p = 'unknown';
  if (peers[peerId]) {
    p = peers[peerId][0] + ':' + peers[peerId][1];
  }
}

function dvsGet(peerId, endpoint, cb) {
  endpoint = endpoint.join ? endpoint.join('/') : endpoint;
  exec('curl', [getPeerUrl(peerId) + '/' + endpoint], function(err, stdout, stderr) {
    if (err) {
      return cb(err);
    }
    var out = JSON.parse(stdout);
    cb(null, out);
  });
}

function dvsPost(peerId, endpoint, data, cb) {
  endpoint = endpoint.join ? endpoint.join('/') : endpoint;
  exec('curl', [
    getPeerUrl(peerId) + '/' + endpoint,
    '-d',
    JSON.stringify(data),
    '-H',
    'Content-Type: application/json'
  ], function(err, stdout, stderr) {
    if (err) {
      return cb(err);
    }
    var out = JSON.parse(stdout);
    cb(null, out);
  });
}

function returnServerErr(res, err) {
  err = JSON.stringify({ error: err });
  res.status(500).send(err).end();
}

function returnReqError(res, err) {
  err = JSON.stringify({ error: err });
  res.status(400).send(err).end();
}

exec('curl', ['-4', 'ifconfig.co'], function(err, stdout, stderr) {
  if (err) {
    console.error(err);
    return;
  }
  var ip = stdout.split('\n')[0];
  var peer = [ip, SERVER_PORT];
  var peerId = md5(JSON.stringify(peer));
  MY_PEER_ID = peerId;
  log('Identified myself as peer '+peerId);
  peers[peerId] = peer;
});

app.get('/peers', function(req, res, next) {
  res.send(peers);
});

app.use(bodyParser.json());

app.post('/peers', function(req, res, next) {
  var p = req.body;
  if (!p.host) {
    return returnReqError(res, 'Peer host is required');
  }
  if (!p.port) {
    return returnReqError(res, 'Peer port is required');
  }
  var newPeer = [p.host, p.port];
  var peerId = md5(JSON.stringify(newPeer));
  peers[peerId] = newPeer;
  schedule('introducePeer', {peerId: peerId});
  res.send({
    host: p.host,
    port: p.port,
  });
});

function unpackAndVerify(bundle) {
  var data = JSON.parse(bundle);
  var signature = data.signature;
  delete data.signature;
  var verify = crypto.createVerify('RSA-SHA256');
  verify.update(JSON.stringify(data));
  console.log('UNPACKKK', data.identity);
  if (verify.verify(new Buffer(data.identity), signature, 'hex')) {
    data.signature = signature;
    return data;
  }
}

app.post('/objects', function(req, res, next) {
  var obj = unpackAndVerify(req.body.object);
  if (!obj) {
    return returnReqError(res, 'Signature does not match!');
  }
  console.log('win!', obj);
  var objId = obj.signature.substr(0, 47);
  db.put('object-'+objId, req.body.object, function(err) {
    if (err) {
      return returnServerErr(res, 'Could not write!');
    }
    res.send({id: objId});
  });
});

function loadObjectFromPeers(objId, peersToTry, cb) {
  var peerId = peersToTry.shift();
  if (!peerId) {
    cb(new Error('no more peers to try'));
  }
  if (peerId = MY_PEER_ID) return loadObjectFromPeers(objId, peersToTry, cb);
  log('Fetching object '+objId+' from peer '+peerId);
  dvsGet(peerId, 'objects/'+objId, function(err, resp) {
    cb(null, resp);
  });
}

app.get('/objects/:id', function(req, res, next) {
  var objId = req.params.id;
  db.get('object-'+objId, function(err, resp) {
    if (err) {
      log('Could not get local object '+objId);
      var peersToTry = Object.keys(peers);
      loadObjectFromPeers(objId, peersToTry, function(err, obj) {
        if (err) {
          return returnServerErr(res, 'Could not get object!');
        }
        res.send(obj);
      });
      return;
    }
    res.send(resp);
  })
});

app.listen(SERVER_PORT, function() {
  log('Server started!');
});

schedule('loadIdentities');
schedule('fetchGhIdentities');
runTask();
