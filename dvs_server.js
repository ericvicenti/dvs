#!/usr/bin/env node

var level = require('level');
var bodyParser = require('body-parser');
var express = require('express');
var exec = require('child_process').exec;
var md5 = require('MD5');
var path = require('path');

var HOME_DIR = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var SERVER_PORT = 8288;
var MY_PEER_ID = null;

var app = express();
var db = level(path.join(HOME_DIR, '.dvs'));
var peers = {};

var tasks = [];

function schedule(name, taskData) {
  tasks.push({
    name: name,
    params: taskData
  });
}

function runTask() {
  var task = tasks.shift();
  if (!task) {
    setTimeout(function() {
      runTask();
    }, 500);
    return;
  }
  var cb = function() {
    runTask();
  }
  switch(task.taskName) {
    case 'introducePeer':
      return introducePeer(task.params, cb);
    case 'fetchPeers':
      return fetchPeers(task.params, cb);
  }
}

function introducePeer(params, cb) {
  var me = peers[MY_PEER_ID];
  dvsPost(params.peerId, 'peers', {host: me[0], port: me[1]}, function(err) {
    if (err) return cb(err);
    schedule('fetchPeers', {params.peerId});
    cb();
  });
}

function fetchPeers(params, cb) {
  dvsGet(params.peerID, 'peers', function(err, remotePeers) {
    if (err) return cb(err);
    Object.keys(remotePeers).forEach(function(remotePeerId) {
      if (!peers[remotePeerId]) {
        peers[remotePeerId] = remotePeers[remotePeerId];
      }
    });
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

exec('curl -4 ifconfig.co', {}, function(err, stdout, stderr) {
  if (err) {
    sendErr(res, err);
    console.error(err);
    return;
  }
  var ip = stdout.split('\n')[0];
  var peer = [ip, SERVER_PORT];
  var peerId = md5(JSON.stringify(peer));
  MY_PEER_ID = peerId;
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

app.listen(SERVER_PORT);

runTask();
