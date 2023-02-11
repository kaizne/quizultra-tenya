import { Directus } from '@directus/sdk'

const directus = new Directus('https://quizultra.directus.app')

export async function getDirectusClient() {
    await directus.auth.static('-qliaDg7_x5lYtWej4V-Xt2QfefUewge')
    return directus
}