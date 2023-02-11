import { NextFunction } from 'express'
import { Socket } from 'socket.io'
import { getDirectusClient } from './directus/directus'
import { MediaImage } from './interfaces'
import supabase from './supabase/supabase'

const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const port = process.env.PORT || 8080

const users: any = {}

interface User {
    username: string
    slug: string
    time: number
    interval: any
    index: number
    questions: Array<object>
    score: number
}

const io = new Server(server, {
    cors: {
        origin: process.env.URL || 'http://localhost:3000',
    }
})

io.use(async (socket: any, next: NextFunction) => {
    const user_id = socket.handshake.auth.user_id
    const username = socket.handshake.auth.username
    
    console.log(`${username} connected`)

    socket.user_id = user_id
    socket.username = username
    
    const user: User = {
        username: username,
        slug: '',
        time: 0,
        interval: null,
        index: 0,
        questions: [],
        score: 0
    }

    users[username] = user
    next()
})

const findCharacterImage = (media: Array<MediaImage>, character: string) => {
    for (let image of media)
        if (image.directus_files_id.title === character)
            return image.directus_files_id.id
    return ''
}

const shuffleArray = (array: Array<any>) => {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1))
        let temp = array[i]
        array[i] = array[j]
        array[j] = temp
    }
    return array
}

io.use((socket: any, next: NextFunction) => {
    const uuid = socket.handshake.query.uuid
    socket.uuid = uuid
    ;(async () => {
        const directus = await getDirectusClient()
        const quizzes = await directus.items('quizzes')

        const query = await quizzes.readOne(uuid, {
            fields: [
                'characters', 
                'media.directus_files_id.id', 
                'media.directus_files_id.title'
            ]
        })

        const characters: object = query.characters
        const media: Array<MediaImage> = query.media

        let questions = []

        for (let group of Object.values(characters)) {
            for (let character of group) {
                const entry: any = {}
                const options: Array<string> = []
                options.push(character)

                for (let i = 0; i < 3; ++i) {
                    let random = Math.floor(Math.random() * group.length)
                    while (group[random] === character || options.includes(group[random]))
                        random = Math.floor(Math.random() * group.length)    
                    options.push(group[random])
                }

                entry.answer = character
                entry.image = findCharacterImage(media, character)
                entry.options = shuffleArray(options)
                questions.push(entry)
            }        
        }
        questions = shuffleArray(questions)
        users[socket.username]['questions'] = questions
        next()
    })()
})

const initializeTimer = (socket: Socket, username: string) => {
    const user = users[username]
    let time = 0
    const interval = setInterval(() => {
        io.to(socket.id).emit('time', time.toFixed(2))
        time += 0.01
        user.time = time.toFixed(2)
    }, 10)
    user.interval = interval
}

io.on('connection', (socket: Socket) => {
    socket.on('start', (username, slug, callback) => {
        const index: number = users[username]['index']
        const questions = users[username]['questions']
        const answer: string = questions[index]['answer']
        const image: Array<string> = questions[index]['image']
        const options: Array<string> = questions[index]['options']
        users[username]['slug'] = slug
        callback({
            answer: answer,
            image: image,
            options: options
        })
        initializeTimer(socket, username)
    })

    socket.on('question', (username, character, callback) => {
        const index: number = users[username]['index']
        const questions = users[username]['questions']
        const answer: string = questions[index]['answer']

        if (answer === character) users[username]['score']++
        
        if (index >= questions.length - 1) {
            callback({ 
                score: users[username]['score'],
                time: users[username]['time'] 
            })

            clearInterval(users[username]['interval'])

            const slug = users[username]['slug']
            const score = users[username]['score']
            const time = users[username]['time']

            ;(async () => {
                const anon = username.slice(0, 5)
                if (anon !== 'anon-') {
                    const { data } = await supabase
                        .from(slug)
                        .select('username, score, time')
                        .eq('username', username)

                    if (data && ((data.length === 0) || (score > data[0].score) 
                        || (score >= data[0].score && time < data[0].time))) {
                            const { error } = await supabase
                                .from(slug)
                                .upsert({ username: username, score: score, time: time })
                            
                            console.log(`submitted time for ${username}`)
                            if (error) console.log (`submission error for ${username}`)

                            const { data } = await supabase
                                .from('profiles')
                                .select('type_zero')
                                .eq('username', username)

                            console.log(data)

                            if (data && data.length > 0) {
                                let type_zero: any = data[0].type_zero
                                type_zero[slug] = { score: score, time: time }

                                const id = (socket as any).user_id

                                const { error } = await supabase
                                    .from('profiles')
                                    .update({ type_zero: type_zero })
                                    .eq('username', username)

                                console.log(`updated profile for ${username}`)
                                if (error) (`profile update error for ${username}`)
                            }
                            
                    }
                } 
                delete users[username]
                socket.disconnect()             
            })()
        }
        else {
            users[username]['index']++
            const index: number = users[username]['index']
            const questions = users[username]['questions']
            const answer: string = questions[index]['answer']
            const image: Array<string> = questions[index]['image']
            const options: Array<string> = questions[index]['options']
            callback({
                answer: answer,
                image: image,
                options: options
            })      
        }
    })

    socket.on('disconnect', () => {
        delete users[(socket as any).username]
        console.log(`${(socket as any).username} disconnected`)
    })
})
  
server.listen(port, () => {
    console.log(`listening on port ${port}`)
})
