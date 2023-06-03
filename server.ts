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
    user_id: string
    username: string
    slug: string
    time: number
    interval: any
    index: number
    questions: Array<object>
    score: number
    season: number
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
        user_id: user_id,
        username: username,
        slug: '',
        time: 0,
        interval: null,
        index: 0,
        questions: [],
        score: 0,
        season: 1
    }

    users[user_id] = user
    // users[username] = user
    next()
})

const findCharacterImage = (media: any, character: string) => {
    for (let image of media)
        if (image.attributes.name.includes(character.toLowerCase()))
            return image.attributes.url
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
    const season = socket.handshake.query.season
    socket.uuid = uuid
    socket.season = season
    
    ;(async () => {
        // const directus = await getDirectusClient()
        // const quizzes = await directus.items('quizzes')

        const response = await fetch(`https://quizultra-strapi-ae4s4.ondigitalocean.app/api/quizzes/${uuid}`)
        const quiz = await response.json()

        /*
        const query = await quizzes.readOne(uuid, {
            fields: [
                'characters', 
                'media.directus_files_id.id', 
                'media.directus_files_id.title'
            ]
        })
        */

        // const characters: object = query.characters
        // const media: Array<MediaImage> = query.media

        

        const characters: any = quiz['data']['attributes']['characters'][season]
        const media = quiz['data']['attributes']['media']['data']

        console.log(media)

        let questions = []

        for (let character of characters) {
            const entry: any = {}
            const options: Array<string> = []
            options.push(character)

            for (let i = 0; i < 3; ++i) {
                let random = Math.floor(Math.random() * characters.length)
                while (characters[random] === character || options.includes(characters[random]))
                    random = Math.floor(Math.random() * characters.length)    
                options.push(characters[random])
            }

            entry.answer = character
            entry.image = findCharacterImage(media, character)
            entry.options = shuffleArray(options)
            questions.push(entry)
        }        
    
        questions = shuffleArray(questions)

        console.log(questions)

        users[socket.user_id]['questions'] = questions
        next()
    })()
})

const initializeTimer = (socket: Socket, user_id: string) => {
    const user = users[user_id]
    let time = 0
    const interval = setInterval(() => {
        io.to(socket.id).emit('time', time.toFixed(2))
        time += 0.01
        user.time = time.toFixed(2)
    }, 10)
    user.interval = interval
}

io.on('connection', (socket: Socket) => {
    socket.on('start', (user_id, slug, season, callback) => {
        const index: number = users[user_id]['index']
        const questions = users[user_id]['questions']
        const answer: string = questions[index]['answer']
        const image: Array<string> = questions[index]['image']
        const options: Array<string> = questions[index]['options']
        users[user_id]['slug'] = slug
        users[user_id]['season'] = season
        callback({
            answer: answer,
            image: image,
            options: options
        })
        initializeTimer(socket, user_id)
    })

    socket.on('question', (user_id, character, callback) => {
        const index: number = users[user_id]['index']
        const questions = users[user_id]['questions']
        const answer: string = questions[index]['answer']

        if (answer === character) users[user_id]['score']++
        
        if (index >= questions.length - 1) {
            callback({ 
                score: users[user_id]['score'],
                time: users[user_id]['time'] 
            })

            clearInterval(users[user_id]['interval'])

            const slug = (users[user_id]['slug']).replaceAll('-', '_')
            const username = users[user_id]['username']
            const score = users[user_id]['score']
            const time = users[user_id]['time']
            const season = users[user_id]['season']

            ;(async () => {
                const anon = user_id.slice(0, 5)
                if (anon !== 'anon-') {
                    const { data } = await supabase
                        .from(slug)
                        .select('id, score, time')
                        .eq('id', user_id)

                    if (data && ((data.length === 0) || (score > data[0].score) 
                        || (score >= data[0].score && time < data[0].time))) {
                            const { error } = await supabase
                                .from(slug)
                                .upsert({ id: user_id, username: username, score: score, time: time, season: season })
                            
                            console.log(`submitted time for ${user_id}`)
                            if (error) console.log (`submission error for ${user_id}, ${JSON.stringify(error)}`)

                            const { data } = await supabase
                                .from('profiles')
                                .select('type_zero')
                                .eq('id', user_id)

                            console.log(data)

                            if (data && data.length > 0) {
                                let type_zero: any = data[0].type_zero
                                type_zero[slug] = { score: score, time: time, season: season }

                                const id = (socket as any).user_id

                                const { error } = await supabase
                                    .from('profiles')
                                    .update({ type_zero: type_zero })
                                    .eq('id', user_id)

                                console.log(`updated profile for ${user_id}`)
                                if (error) (`profile update error for ${user_id}`)
                            }
                            
                    }
                } 
                delete users[user_id]
                socket.disconnect()             
            })()
        }
        else {
            users[user_id]['index']++
            const index: number = users[user_id]['index']
            const questions = users[user_id]['questions']
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
        delete users[(socket as any).user_id]
        console.log(`${(socket as any).username} disconnected`)
    })
})
  
server.listen(port, () => {
    console.log(`listening on port ${port}`)
})
