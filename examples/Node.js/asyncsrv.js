//
//  Asynchronous client-server
//  While this example runs in a node cluster, that is to make
//  it easier to start and stop the example.
//
//  Port of asyncsrv.c
//  Written by: Nathan Stott
'use strict';

var cluster = require('cluster')
  , zmq = require('zmq');

if (cluster.isMaster) {
  main();
} else {
  process.on('message', function (role) {
    if (role === 'server worker') {
      serverWorker();
    } else {
      clientTask();
    }
  });
}

function main() {
  var sockets = serverTask();

  for (var i=0;i<3;i++) {
    forkClientTask();
  }

  setTimeout(function () {
    sockets.forEach(function (socket) {
      socket.close();
    });

    Object.keys(cluster.workers).forEach(function (id) {
      cluster.workers[id].kill();
    });
  }, 5000);
}

/**
 * This is our client task
 * It connects to the server, and then sends a request once per second
 * It collects responses as they arrive, and it prints them out. We will
 * run several client tasks in parallel, each with a different random ID.
 */
function clientTask() {
  //  Set random identity to make tracing easier
  var identity = randomString();

  var client = zmq.socket('dealer');
  client.identity = identity;

  client.connect('ipc://frontend.ipc');

  client.on('message', function (reply) {
    console.log(identity+' received '+reply);
  });

  var reqs = 0;
  setInterval(function () {
    reqs++;
    client.send('Request #'+reqs);
  }, 10);
}

/**
 * This is our server task.
 * It uses the multithreaded server model to deal requests out to a pool
 * of workers and route replies back to clients. One worker can handle
 * one request at a time but one client can talk to multiple workers at
 * once.
 */
function serverTask() {
  var frontend = zmq.socket('router');
  frontend.bindSync('ipc://frontend.ipc');

  var backend = zmq.socket('dealer');
  backend.bindSync('ipc://backend.ipc');

  frontend.on('message', function () {
    var parts = Array.prototype.slice.call(arguments);
    backend.send(parts);
  });

  backend.on('message', function () {
    var parts = Array.prototype.slice.call(arguments);
    frontend.send(parts);
  });

  for (var i=0;i<3;i++) {
    forkServerWorker();
  }

  return [frontend, backend];
}

/**
 * Each worker task works on one request at a time and sends a random number
 * of replies back, with random delays between replies.
 */
function serverWorker() {
  var worker = zmq.socket('dealer');
  worker.connect('ipc://backend.ipc');

  worker.on('message', function () {
    var parts = Array.prototype.slice.call(arguments);
    var lastPartIndex = parts.length - 1;

    // Add the process id of the worker
    parts[lastPartIndex] = parts[lastPartIndex] + ' from '+process.pid;

    var numReplies = randomBetween(1, 5);
    var send = function () {
      worker.send(parts);
    };

    for (var i=0;i<numReplies;i++) {
      // stagger replies
      setTimeout(send, randomBetween(i*100, (i*100)+(numReplies*100)));
    }
  });
}

function forkClientTask() {
  var clientTask = cluster.fork();
  clientTask.send('client task');
}

function forkServerWorker() {
  var serverWorker = cluster.fork();
  serverWorker.send('server worker');
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function randomString() {
  var source = 'abcdefghijklmnopqrstuvwxyz'
    , target = [];

  for (var i = 0; i < 20; i++) {
    target.push(source[randomBetween(0, source.length)]);
  }
  return target.join('');
}

