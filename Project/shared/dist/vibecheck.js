// VibeCheck: lifestyle compatibility between a person and the residents of a room.
// Lifestyle habits only (sleep, tidiness, noise, guests, kitchen, schedule,
// temperature, lights). Never caste, religion, diet or any identity question.
// Shared by the API (scoring) and the web app (the questions people answer).
// Every phrase reads after both "You both …" and "A roommate tends to …".
export const VIBE_QUESTIONS = [
    {
        id: 'sleep', weight: 2, question: 'When do you usually go to sleep?',
        options: [{ value: 0, label: 'Before 11 pm' }, { value: 1, label: '11 pm to 1 am' }, { value: 2, label: 'After 1 am' }],
        phrase: ['sleep before 11 pm', 'sleep around midnight', 'stay up after 1 am']
    },
    {
        id: 'wake', weight: 1, question: 'When do you usually wake up?',
        options: [{ value: 0, label: 'Before 7 am' }, { value: 1, label: '7 to 9 am' }, { value: 2, label: 'After 9 am' }],
        phrase: ['wake up before 7 am', 'wake up between 7 and 9 am', 'wake up after 9 am']
    },
    {
        id: 'tidiness', weight: 2, question: 'How tidy do you keep your space?',
        options: [{ value: 0, label: 'Spotless, every day' }, { value: 1, label: 'Tidy most days' }, { value: 2, label: 'Relaxed about it' }],
        phrase: ['keep things spotless', 'keep things tidy most days', 'keep a relaxed approach to tidiness']
    },
    {
        id: 'noise', weight: 2, question: 'How much noise is normal for you in the room?',
        options: [{ value: 0, label: 'Quiet, headphones on' }, { value: 1, label: 'Some calls or music' }, { value: 2, label: 'Lively: calls, music, chats' }],
        phrase: ['like a quiet room', 'like some calls or music', 'like a lively room']
    },
    {
        id: 'guests', weight: 1, question: 'How often do friends visit you?',
        options: [{ value: 0, label: 'Rarely' }, { value: 1, label: 'Sometimes' }, { value: 2, label: 'Often' }],
        phrase: ['rarely have visitors', 'sometimes have visitors', 'often have visitors']
    },
    {
        id: 'kitchen', weight: 1, question: 'How often do you use the shared kitchen?',
        options: [{ value: 0, label: 'Rarely' }, { value: 1, label: 'A few times a week' }, { value: 2, label: 'Every day' }],
        phrase: ['rarely use the kitchen', 'use the kitchen a few times a week', 'use the kitchen every day']
    },
    {
        id: 'schedule', weight: 1, question: 'When are you usually busy with study or work?',
        options: [{ value: 0, label: 'Daytime' }, { value: 1, label: 'Mixed or flexible' }, { value: 2, label: 'Evenings or nights' }],
        phrase: ['study or work in the daytime', 'have a flexible schedule', 'study or work evenings or nights']
    },
    {
        id: 'cooling', weight: 1, question: 'What room temperature do you like?',
        options: [{ value: 0, label: 'Cool, AC on' }, { value: 1, label: 'In between' }, { value: 2, label: 'Warm, fan only' }],
        phrase: ['like the room cool', 'like a moderate temperature', 'prefer a fan to AC']
    }
];
/** Keeps only known questions with a valid option value. Null when nothing valid is left. */
export function cleanVibeAnswers(input) {
    if (!input || typeof input !== 'object')
        return null;
    const out = {};
    for (const question of VIBE_QUESTIONS) {
        const value = Number(input[question.id]);
        if (Number.isInteger(value) && value >= 0 && value <= 2)
            out[question.id] = value;
    }
    return Object.keys(out).length ? out : null;
}
/** Similarity of two people on the questions both answered: 0–1, or null. */
function pairScore(a, b) {
    let weighted = 0;
    let total = 0;
    for (const question of VIBE_QUESTIONS) {
        if (a[question.id] === undefined || b[question.id] === undefined)
            continue;
        weighted += question.weight * (1 - Math.abs(a[question.id] - b[question.id]) / 2);
        total += question.weight;
    }
    return total ? weighted / total : null;
}
/**
 * Scores a person against everyone already in a room. Reasons name habits, never
 * people: roommates' individual answers are not revealed.
 */
export function vibeMatch(person, roommates) {
    const scores = roommates.map((mate) => pairScore(person, mate)).filter((s) => s !== null);
    if (!scores.length)
        return { score: null, compared: 0, reasons: [], differences: [] };
    const score = Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100);
    const shared = [];
    const apart = [];
    for (const question of VIBE_QUESTIONS) {
        const mine = person[question.id];
        if (mine === undefined)
            continue;
        const theirs = roommates.map((mate) => mate[question.id]).filter((v) => v !== undefined);
        if (!theirs.length)
            continue;
        if (theirs.every((v) => v === mine)) {
            shared.push({ weight: question.weight, text: `You both ${question.phrase[mine]}` });
        }
        else if (theirs.some((v) => Math.abs(v - mine) === 2)) {
            const other = theirs.find((v) => Math.abs(v - mine) === 2);
            apart.push({ weight: question.weight, text: `A roommate tends to ${question.phrase[other]}` });
        }
    }
    const byWeight = (x, y) => y.weight - x.weight;
    return {
        score,
        compared: scores.length,
        reasons: shared.sort(byWeight).slice(0, 2).map((item) => item.text),
        differences: apart.sort(byWeight).slice(0, 1).map((item) => item.text)
    };
}
/** Longest habit summary kept (written by the profile agent, reviewed by the person). */
export const VIBE_SUMMARY_MAX = 300;
/** A one- or two-sentence habits-only summary, trimmed and single-line. Null when empty. */
export function cleanVibeSummary(input) {
    if (typeof input !== 'string')
        return null;
    const text = input.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, VIBE_SUMMARY_MAX);
    return text || null;
}
/**
 * Which lifestyle topics matter for this PG. A PG with no shared kitchen makes
 * kitchen use irrelevant; with no AC rooms, room temperature is not shared.
 * `facts` describe the PG for the conversation; `skip` lists habit ids to leave out.
 */
export function vibeTopicsFor(place) {
    if (!place)
        return { skip: [], facts: [] };
    const amenities = (place.amenities ?? []).map((item) => item.toLowerCase());
    const rooms = place.rooms ?? [];
    const skip = [];
    const facts = [];
    if (place.name)
        facts.push(`The PG is ${place.name}${place.locality ? ` in ${place.locality}` : ''}.`);
    if (amenities.some((item) => item.includes('kitchen')))
        facts.push('Residents share a kitchen.');
    else {
        skip.push('kitchen');
        facts.push('There is no shared kitchen for residents.');
    }
    if (rooms.some((room) => room.hasAc))
        facts.push('Some rooms have AC, shared by roommates.');
    else {
        skip.push('cooling');
        facts.push('Rooms have no AC.');
    }
    if (rooms.some((room) => room.foodIncluded || (room.foodCharge ?? 0) > 0) || amenities.some((item) => item.includes('meal') || item.includes('food'))) {
        facts.push('The PG serves meals.');
    }
    return { skip, facts };
}
