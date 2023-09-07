const express = require('express');
const dockerode = require('dockerode');
const path = require('path');
var auth = require('basic-auth-connect');
let docker = new dockerode();
var auth = require('basic-auth-connect');
let app = express();
app.use(auth(process.env.USER, process.env.PASS));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/containers', async (req, res) => {
    let containers = await docker.listContainers();
    res.render('containers', { containers });
});
app.get('/images', async (req, res) => {
    let images = await docker.listImages();
    res.render('images', { images });
});
app.get('/volumes', async (req, res) => {
    let volumes = await docker.listVolumes();
    res.render('volumes', { volumes });
});
app.get('/build', async (req, res) => {
    let stream = await docker.buildImage({
        context: __dirname,
        src: ['Dockerfile']
    }, { t: 'your_image' });
    res.render('build');
});
app.post('/create', async (req, res) => {
    let container = await docker.createContainer({
        Image: req.body.image,
        Cmd: ['/bin/bash'],
        name: req.body.name,
    });
    res.redirect('/containers');
});
app.get('/container/:containerId', async (req, res) => {
    console.log('test')
    let container = docker.getContainer(req.params.containerId);
    let data = await container.inspect();
    res.render('container', { container: data });
});
app.delete('/containers/:containerId', async (req, res) => {
    let container = docker.getContainer(req.params.containerId);
    await container.remove();
    res.redirect('/containers');
})
app.delete('/images/:imageId', async (req, res) => {
    let image = docker.getImage(req.params.imageId);
    await image.remove();
    res.redirect('/images');
})
app.delete('/volumes/:volumeName', async (req, res) => {
    let volume = docker.getVolume(req.params.volumeName);
    await volume.remove();
    res.redirect('/volumes');
})
app.put('/containers/:containerId', async (req, res) => {
    let container = docker.getContainer(req.params.containerId);
    if (req.body.action === "start") { await container.start(); }
    else if (req.body.action === "stop") { await container.stop(); }
    else if (req.body.action === "restart") { await container.restart(); }
    res.redirect('/containers');
});

const WebSocket = require('ws');
const streamBuffers = require('stream-buffers');

app.get('/stream/:containerId', async (req, res) => {
    let container = docker.getContainer(req.params.containerId);
    let exec = await container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true
    });

    let duplex = await exec.start({ Detach: false, Tty: true });

    let stdoutStream = new streamBuffers.WritableStreamBuffer({
        initialSize: (100 * 1024),   // start at 100 kilobytes.
        incrementAmount: (10 * 1024)  // grow by 10 kilobytes each time buffer overflows.
    });

    let stderrStream = new streamBuffers.WritableStreamBuffer({
        initialSize: (100 * 1024),
        incrementAmount: (10 * 1024)
    });

    duplex.pipe(stdoutStream);
    duplex.pipe(stderrStream);

    let ws = new WebSocket('ws://localhost:9898/container_stream');

    ws.on('open', () => {
      ws.send(JSON.stringify({ stdout: stdoutStream.getContentsAsString(), stderr: stderrStream.getContentsAsString() }));
    });

    ws.on('message', (data) => {
      let incoming = JSON.parse(data);
      if (incoming.stdin) {
        duplex.write(incoming.stdin + '\n');
      } else if (incoming.kill) {
        exec.signal({ signal: incoming.kill }, (err, data) => {
          if (err) return ws.send(JSON.stringify({ error: err }));
          ws.send(JSON.stringify({ signal: data }));
        });
      }
    });

});

app.listen(9898, () => console.log("Running on port 3000"));