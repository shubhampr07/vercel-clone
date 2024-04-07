const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const Redis = require('ioredis')
const cors = require('cors');
const {Server} = require('socket.io')


const app = express();

const PORT = 9000;

app.use(cors());

const subscriber = new Redis(process.env.REDIS_SUBSCRIBER_STRING)

const io = new Server({ cors: '*' })

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9001, () => {
    console.log(`Socket IO server is running on 9001`)
})

const ecsClient = new ECSClient({
    region: process.env.LOCATION,
    credentials: {
        accessKeyId: process.env.ACCESSKEYID,
        secretAccessKey: process.env.SECRETACCESSKEY,
    }
})

const config = {
    CLUSTER: '',
    TASK: ''
}

app.use(express.json())

app.post('/project', async (req, res) => {
    const { gitURL, slug } = req.body
    const projectSlug = slug ? slug : generateSlug();

    //spining the docker container

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['subnet-06e3f4966ba74f9e0', 'subnet-05e7c7a02c7a1eeba', 'subnet-09cf26188e138579b'],
                securityGroups: ['sg-0a193db9c0a4f3f0e']
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'builder-image1',
                    environment: [
                        {name: 'GIT_REPOSITORY__URL', value: gitURL},
                        {name: 'PROJECT_ID', value: projectSlug}
                    ]
                }
            ]
        }
    })
    await ecsClient.send(command);
    return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.localhost:8000`}})
})


async function initRedisSubscribe() {
    console.log("Subscribed to logs...")
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}

initRedisSubscribe();

app.listen(PORT, () => {
    console.log(`API-Server is running on port ${PORT}`);
})
