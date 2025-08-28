const axios = require('axios');
const valkeyClient = require('./valkey-client');
const { cleanupLegacyCache } = require('./cleanup-legacy-cache');

// Sanitizes log values by removing control characters and truncating length
// to prevent log injection attacks and improve readability
function sanitizeLogValue(value) {
    return String(value || '').replace(/[\r\n\t]/g, ' ').substring(0, 200);
}

class QuestionService {
    constructor() {
        this.lastApiCall = 0;
        this.minInterval = 1500; // 1.5 seconds between API calls (40 calls/minute max)
        this.lastCleanupDate = null;
    }

    async fetchAndCacheQuestions(category = 'general') {
        try {
            // One-time cleanup of legacy cache per day
            const today = new Date().toDateString();
            if (this.lastCleanupDate !== today) {
                try {
                await cleanupLegacyCache();
            } catch (err) {
                console.error('Cleanup error:', sanitizeLogValue(err.message));
            }
                this.lastCleanupDate = today;
            }
            
            // First check weekly questions cache
            const weekKey = this.getWeekKey();
            let weeklyQuestions = await valkeyClient.getWeeklyQuestions(weekKey);
            
            if (weeklyQuestions && weeklyQuestions.length >= 100) {
                return weeklyQuestions;
            }
            
            // Fallback to previous week if current week not ready
            const previousWeekKey = this.getPreviousWeekKey(weekKey);
            weeklyQuestions = await valkeyClient.getWeeklyQuestions(previousWeekKey);
            
            if (weeklyQuestions && weeklyQuestions.length >= 100) {
                console.log(`Using previous week questions: ${sanitizeLogValue(previousWeekKey)}`);
                return weeklyQuestions;
            }
            
        } catch (error) {
            console.error('Weekly cache check failed:', error);
        }

        // Fallback: return mock questions
        console.log('No cached questions available, using mock questions');
        return this.getMockQuestions();
    }

    getWeekKey() {
        const now = new Date();
        const year = now.getFullYear();
        const week = this.getWeekNumber(now);
        return `${year}-W${week.toString().padStart(2, '0')}`;
    }

    getPreviousWeekKey(currentWeekKey) {
        if (!currentWeekKey || !currentWeekKey.includes('-W')) {
            throw new Error('Invalid week key format');
        }
        const [year, weekStr] = currentWeekKey.split('-W');
        const week = parseInt(weekStr);
        if (isNaN(week) || week < 1 || week > 53) {
            throw new Error('Invalid week number');
        }
        
        if (week === 1) {
            // Check if previous year has 53 weeks
            const prevYear = parseInt(year) - 1;
            const lastWeekOfPrevYear = this.getWeeksInYear(prevYear);
            return `${prevYear}-W${lastWeekOfPrevYear.toString().padStart(2, '0')}`;
        } else {
            return `${year}-W${(week - 1).toString().padStart(2, '0')}`;
        }
    }
    
    getWeeksInYear(year) {
        const jan1 = new Date(year, 0, 1);
        const dec31 = new Date(year, 11, 31);
        return jan1.getDay() === 4 || dec31.getDay() === 4 ? 53 : 52;
    }

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    async getGameQuestions(userId, category = 'general') {
        try {
            const allQuestions = await this.fetchAndCacheQuestions(category);
            
            // Try to get seen questions with timeout
            let seenQuestions = [];
            try {
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('Timeout')), 1000);
                });
                
                seenQuestions = await Promise.race([
                    valkeyClient.getSeenQuestions(userId),
                    timeoutPromise
                ]);
                
                clearTimeout(timeoutId);
            } catch (error) {
                console.error('Failed to get seen questions, using empty set:', sanitizeLogValue(error.message));
            }
            
            // Filter out seen questions using Set for O(1) lookup
            const seenQuestionsSet = new Set(seenQuestions);
            const unseenQuestions = allQuestions.filter(q => !seenQuestionsSet.has(q.id));
            
            // If less than 5 unseen questions, just use all questions
            if (unseenQuestions.length < 5) {
                return this.shuffleArray(allQuestions).slice(0, 5);
            }
            
            return this.shuffleArray(unseenQuestions).slice(0, 5);
        } catch (error) {
            console.error('Error getting game questions, using mock:', error);
            return this.getMockQuestions();
        }
    }
    
    getMockQuestions() {
        // Reduced dataset for better performance - full questions loaded from weekly cache
        return [
          {
                    "id": "mock-1",
                    "question": "In &quot;A Hat in Time&quot;, what must Hat Kid collect to finish a level",
                    "correct_answer": "A time piece",
                    "incorrect_answers": [
                              "A heart fragment",
                              "A relic fragment",
                              "A hat"
                    ]
          },
          {
                    "id": "mock-2",
                    "question": "What is the name of the virus in &quot;Metal Gear Solid 1&quot;?",
                    "correct_answer": "FOXDIE",
                    "incorrect_answers": [
                              "FOXENGINE",
                              "FOXALIVE",
                              "FOXKILL"
                    ]
          },
          {
                    "id": "mock-3",
                    "question": "What is the name of New Zealand&#039;s indigenous people?",
                    "correct_answer": "Maori",
                    "incorrect_answers": [
                              "Vikings",
                              "Polynesians",
                              "Samoans"
                    ]
          },
          {
                    "id": "mock-4",
                    "question": "What year was Super Mario Bros. released?",
                    "correct_answer": "1985",
                    "incorrect_answers": [
                              "1983",
                              "1987",
                              "1986"
                    ]
          },
          {
                    "id": "mock-5",
                    "question": "How many zombies need to be killed to get the &quot;Zombie Genocider&quot; achievement in Dead Rising (2006)?",
                    "correct_answer": "53,594",
                    "incorrect_answers": [
                              "53,593",
                              "53,595",
                              "53,596"
                    ]
          },
          {
                    "id": "mock-6",
                    "question": "Which country hosted the 2022 FIFA World Cup?",
                    "correct_answer": "Qatar",
                    "incorrect_answers": [
                              "USA",
                              "Japan",
                              "Switzerland"
                    ]
          },
          {
                    "id": "mock-7",
                    "question": "What was the name of the German offensive operation in October 1941 to take Moscow before winter?",
                    "correct_answer": "Operation Typhoon",
                    "incorrect_answers": [
                              "Operation Sunflower",
                              "Operation Barbarossa",
                              "Case Blue"
                    ]
          },
          {
                    "id": "mock-8",
                    "question": "Better known by his nickname Logan, what is Wolverine&#039;s birth name?",
                    "correct_answer": "James Howlett",
                    "incorrect_answers": [
                              "Logan Wolf",
                              "Thomas Wilde",
                              "John Savage"
                    ]
          },
          {
                    "id": "mock-9",
                    "question": "Which of these musicals won the Tony Award for Best Musical?",
                    "correct_answer": "Rent",
                    "incorrect_answers": [
                              "The Color Purple",
                              "American Idiot",
                              "Newsies"
                    ]
          },
          {
                    "id": "mock-10",
                    "question": "The fictional movie &#039;Rochelle, Rochelle&#039; features in which sitcom?",
                    "correct_answer": "Seinfeld",
                    "incorrect_answers": [
                              "Frasier",
                              "Cheers",
                              "Friends"
                    ]
          },
          {
                    "id": "mock-11",
                    "question": "Which of the following bands is Tom DeLonge not a part of?",
                    "correct_answer": "+44",
                    "incorrect_answers": [
                              "Box Car Racer",
                              "Blink-182",
                              "Angels &amp; Airwaves"
                    ]
          },
          {
                    "id": "mock-12",
                    "question": "Which band is the longest active band in the world with no breaks or line-up changes?",
                    "correct_answer": "U2",
                    "incorrect_answers": [
                              "Radiohead",
                              "Rush",
                              "Rolling Stones"
                    ]
          },
          {
                    "id": "mock-13",
                    "question": "Who scored the injury time winning goal in the 1999 UEFA Champions League final between Manchester United and Bayern Munich?",
                    "correct_answer": "Ole Gunnar Solskj&aelig;r",
                    "incorrect_answers": [
                              "Dwight Yorke",
                              "Andy Cole",
                              "David Beckham"
                    ]
          },
          {
                    "id": "mock-14",
                    "question": "&quot;Gimmick!&quot; is a Japanese Famicom game that uses a sound chip expansion in the cartridge. What is it called?",
                    "correct_answer": "FME-7",
                    "incorrect_answers": [
                              "VRC7",
                              "VRC6",
                              "MMC5"
                    ]
          },
          {
                    "id": "mock-15",
                    "question": "In what year was &quot;Antichamber&quot; released?",
                    "correct_answer": "2013",
                    "incorrect_answers": [
                              "2012",
                              "2014",
                              "2011"
                    ]
          },
          {
                    "id": "mock-16",
                    "question": "What is the capital of Chile?",
                    "correct_answer": "Santiago",
                    "incorrect_answers": [
                              "Valpara&iacute;so",
                              "Copiap&oacute;",
                              "Antofagasta"
                    ]
          },
          {
                    "id": "mock-17",
                    "question": "Which of the following languages is used as a scripting language in the Unity 3D game engine?",
                    "correct_answer": "C#",
                    "incorrect_answers": [
                              "Java",
                              "C++",
                              "Objective-C"
                    ]
          },
          {
                    "id": "mock-18",
                    "question": "In &quot;Donkey Kong Country&quot;, why does Donkey Kong want to know the secret of the crystal coconut?",
                    "correct_answer": "He&#039;s the big kahuna.",
                    "incorrect_answers": [
                              "To find out where all the bananas are.",
                              "Because Diddy Kong forced him.",
                              "He wants to punish brutes."
                    ]
          },
          {
                    "id": "mock-19",
                    "question": "Which car manufacturer created the &quot;Aventador&quot;?",
                    "correct_answer": "Lamborghini",
                    "incorrect_answers": [
                              "Ferrari",
                              "Pagani",
                              "Bugatti"
                    ]
          },
          {
                    "id": "mock-20",
                    "question": "What was the first movie to ever use a Wilhelm Scream?",
                    "correct_answer": "Distant Drums",
                    "incorrect_answers": [
                              "Treasure of the Sierra Madre",
                              "The Charge at Feather River",
                              "Indiana Jones"
                    ]
          },
          {
                    "id": "mock-21",
                    "question": "In the 1969 Cartoon show &quot;Dastardly and Muttley in Their Flying Machines&quot;, which were NOT one of the lyrics in the opening theme?",
                    "correct_answer": "Stab him",
                    "incorrect_answers": [
                              "Nab him",
                              "Jab him",
                              "Tab him"
                    ]
          },
          {
                    "id": "mock-22",
                    "question": "What is the name of the planet that the Doctor from television series &quot;Doctor Who&quot; comes from?",
                    "correct_answer": "Gallifrey",
                    "incorrect_answers": [
                              "Sontar",
                              "Skaro",
                              "Mondas"
                    ]
          },
          {
                    "id": "mock-23",
                    "question": "&quot;The Big Bang Theory&quot; was first theorized by a priest of what religious ideology?",
                    "correct_answer": "Catholic",
                    "incorrect_answers": [
                              "Christian",
                              "Jewish",
                              "Islamic"
                    ]
          },
          {
                    "id": "mock-24",
                    "question": "The Touhou Project series of games is often associated with which genre?",
                    "correct_answer": "Shoot &#039;em up",
                    "incorrect_answers": [
                              "Strategy",
                              "FPS",
                              "Casual"
                    ]
          },
          {
                    "id": "mock-25",
                    "question": "Where are Terror Fiends more commonly found in the Nintendo game Miitopia?",
                    "correct_answer": "New Lumos",
                    "incorrect_answers": [
                              "Peculia",
                              "The Sky Scraper",
                              "Otherworld"
                    ]
          }
        ];
    }
    
    getFullMockQuestions() {
        // Full dataset available if needed
        return [
          {
                    "id": "mock-1",
                    "question": "In &quot;A Hat in Time&quot;, what must Hat Kid collect to finish a level",
                    "correct_answer": "A time piece",
                    "incorrect_answers": [
                              "A heart fragment",
                              "A relic fragment",
                              "A hat"
                    ]
          },
          {
                    "id": "mock-2",
                    "question": "What is the name of the virus in &quot;Metal Gear Solid 1&quot;?",
                    "correct_answer": "FOXDIE",
                    "incorrect_answers": [
                              "FOXENGINE",
                              "FOXALIVE",
                              "FOXKILL"
                    ]
          },
          {
                    "id": "mock-3",
                    "question": "What is the name of New Zealand&#039;s indigenous people?",
                    "correct_answer": "Maori",
                    "incorrect_answers": [
                              "Vikings",
                              "Polynesians",
                              "Samoans"
                    ]
          },
          {
                    "id": "mock-4",
                    "question": "What year was Super Mario Bros. released?",
                    "correct_answer": "1985",
                    "incorrect_answers": [
                              "1983",
                              "1987",
                              "1986"
                    ]
          },
          {
                    "id": "mock-5",
                    "question": "How many zombies need to be killed to get the &quot;Zombie Genocider&quot; achievement in Dead Rising (2006)?",
                    "correct_answer": "53,594",
                    "incorrect_answers": [
                              "53,593",
                              "53,595",
                              "53,596"
                    ]
          },
          {
                    "id": "mock-6",
                    "question": "Which country hosted the 2022 FIFA World Cup?",
                    "correct_answer": "Qatar",
                    "incorrect_answers": [
                              "USA",
                              "Japan",
                              "Switzerland"
                    ]
          },
          {
                    "id": "mock-7",
                    "question": "What was the name of the German offensive operation in October 1941 to take Moscow before winter?",
                    "correct_answer": "Operation Typhoon",
                    "incorrect_answers": [
                              "Operation Sunflower",
                              "Operation Barbarossa",
                              "Case Blue"
                    ]
          },
          {
                    "id": "mock-8",
                    "question": "Better known by his nickname Logan, what is Wolverine&#039;s birth name?",
                    "correct_answer": "James Howlett",
                    "incorrect_answers": [
                              "Logan Wolf",
                              "Thomas Wilde",
                              "John Savage"
                    ]
          },
          {
                    "id": "mock-9",
                    "question": "Which of these musicals won the Tony Award for Best Musical?",
                    "correct_answer": "Rent",
                    "incorrect_answers": [
                              "The Color Purple",
                              "American Idiot",
                              "Newsies"
                    ]
          },
          {
                    "id": "mock-10",
                    "question": "The fictional movie &#039;Rochelle, Rochelle&#039; features in which sitcom?",
                    "correct_answer": "Seinfeld",
                    "incorrect_answers": [
                              "Frasier",
                              "Cheers",
                              "Friends"
                    ]
          },
          {
                    "id": "mock-11",
                    "question": "Which of the following bands is Tom DeLonge not a part of?",
                    "correct_answer": "+44",
                    "incorrect_answers": [
                              "Box Car Racer",
                              "Blink-182",
                              "Angels &amp; Airwaves"
                    ]
          },
          {
                    "id": "mock-12",
                    "question": "Which band is the longest active band in the world with no breaks or line-up changes?",
                    "correct_answer": "U2",
                    "incorrect_answers": [
                              "Radiohead",
                              "Rush",
                              "Rolling Stones"
                    ]
          },
          {
                    "id": "mock-13",
                    "question": "Who scored the injury time winning goal in the 1999 UEFA Champions League final between Manchester United and Bayern Munich?",
                    "correct_answer": "Ole Gunnar Solskj&aelig;r",
                    "incorrect_answers": [
                              "Dwight Yorke",
                              "Andy Cole",
                              "David Beckham"
                    ]
          },
          {
                    "id": "mock-14",
                    "question": "&quot;Gimmick!&quot; is a Japanese Famicom game that uses a sound chip expansion in the cartridge. What is it called?",
                    "correct_answer": "FME-7",
                    "incorrect_answers": [
                              "VRC7",
                              "VRC6",
                              "MMC5"
                    ]
          },
          {
                    "id": "mock-15",
                    "question": "In what year was &quot;Antichamber&quot; released?",
                    "correct_answer": "2013",
                    "incorrect_answers": [
                              "2012",
                              "2014",
                              "2011"
                    ]
          },
          {
                    "id": "mock-16",
                    "question": "What is the capital of Chile?",
                    "correct_answer": "Santiago",
                    "incorrect_answers": [
                              "Valpara&iacute;so",
                              "Copiap&oacute;",
                              "Antofagasta"
                    ]
          },
          {
                    "id": "mock-17",
                    "question": "Which of the following languages is used as a scripting language in the Unity 3D game engine?",
                    "correct_answer": "C#",
                    "incorrect_answers": [
                              "Java",
                              "C++",
                              "Objective-C"
                    ]
          },
          {
                    "id": "mock-18",
                    "question": "In &quot;Donkey Kong Country&quot;, why does Donkey Kong want to know the secret of the crystal coconut?",
                    "correct_answer": "He&#039;s the big kahuna.",
                    "incorrect_answers": [
                              "To find out where all the bananas are.",
                              "Because Diddy Kong forced him.",
                              "He wants to punish brutes."
                    ]
          },
          {
                    "id": "mock-19",
                    "question": "Which car manufacturer created the &quot;Aventador&quot;?",
                    "correct_answer": "Lamborghini",
                    "incorrect_answers": [
                              "Ferrari",
                              "Pagani",
                              "Bugatti"
                    ]
          },
          {
                    "id": "mock-20",
                    "question": "What was the first movie to ever use a Wilhelm Scream?",
                    "correct_answer": "Distant Drums",
                    "incorrect_answers": [
                              "Treasure of the Sierra Madre",
                              "The Charge at Feather River",
                              "Indiana Jones"
                    ]
          },
          {
                    "id": "mock-21",
                    "question": "In the 1969 Cartoon show &quot;Dastardly and Muttley in Their Flying Machines&quot;, which were NOT one of the lyrics in the opening theme?",
                    "correct_answer": "Stab him",
                    "incorrect_answers": [
                              "Nab him",
                              "Jab him",
                              "Tab him"
                    ]
          },
          {
                    "id": "mock-22",
                    "question": "What is the name of the planet that the Doctor from television series &quot;Doctor Who&quot; comes from?",
                    "correct_answer": "Gallifrey",
                    "incorrect_answers": [
                              "Sontar",
                              "Skaro",
                              "Mondas"
                    ]
          },
          {
                    "id": "mock-23",
                    "question": "&quot;The Big Bang Theory&quot; was first theorized by a priest of what religious ideology?",
                    "correct_answer": "Catholic",
                    "incorrect_answers": [
                              "Christian",
                              "Jewish",
                              "Islamic"
                    ]
          },
          {
                    "id": "mock-24",
                    "question": "The Touhou Project series of games is often associated with which genre?",
                    "correct_answer": "Shoot &#039;em up",
                    "incorrect_answers": [
                              "Strategy",
                              "FPS",
                              "Casual"
                    ]
          },
          {
                    "id": "mock-25",
                    "question": "Where are Terror Fiends more commonly found in the Nintendo game Miitopia?",
                    "correct_answer": "New Lumos",
                    "incorrect_answers": [
                              "Peculia",
                              "The Sky Scraper",
                              "Otherworld"
                    ]
          },
          {
                    "id": "mock-26",
                    "question": "Which of these is not a playable character in &quot;Enter The Gungeon?&quot;",
                    "correct_answer": "The Heavy",
                    "incorrect_answers": [
                              "The Bullet",
                              "The Robot",
                              "The Cultist"
                    ]
          },
          {
                    "id": "mock-27",
                    "question": "Which of these two plates are best know for forming earthquakes and tsunami&#039;s? ",
                    "correct_answer": "Convergent Plate Boundaries/Oceanic Crust",
                    "incorrect_answers": [
                              "Divergent Plate Boundaries/Convergent/Oceanic Crust",
                              "Transform Plate Boundaries/Divergent Plate Boundaries",
                              "Oceanic &amp; Continental Crust/Transform Plate Boundaries"
                    ]
          },
          {
                    "id": "mock-28",
                    "question": "What year did Albrecht D&uuml;rer create the painting &quot;The Young Hare&quot;?",
                    "correct_answer": "1502",
                    "incorrect_answers": [
                              "1702",
                              "1402",
                              "1602"
                    ]
          },
          {
                    "id": "mock-29",
                    "question": "In what sport does Fanny Chmelar compete for Germany?",
                    "correct_answer": "Skiing",
                    "incorrect_answers": [
                              "Swimming",
                              "Showjumping",
                              "Gymnastics"
                    ]
          },
          {
                    "id": "mock-30",
                    "question": "Which mathematician refused the Fields Medal?",
                    "correct_answer": "Grigori Perelman",
                    "incorrect_answers": [
                              "Andrew Wiles",
                              "Terence Tao",
                              "Edward Witten"
                    ]
          },
          {
                    "id": "mock-31",
                    "question": "Which horror movie had a sequel in the form of a video game released in August 20, 2002?",
                    "correct_answer": "The Thing",
                    "incorrect_answers": [
                              "The Evil Dead",
                              "Saw",
                              "Alien"
                    ]
          },
          {
                    "id": "mock-32",
                    "question": "What does the &quot;MP&quot; stand for in MP3?",
                    "correct_answer": "Moving Picture",
                    "incorrect_answers": [
                              "Music Player",
                              "Multi Pass",
                              "Micro Point"
                    ]
          },
          {
                    "id": "mock-33",
                    "question": "Generally, which component of a computer draws the most power?",
                    "correct_answer": "Video Card",
                    "incorrect_answers": [
                              "Hard Drive",
                              "Processor",
                              "Power Supply"
                    ]
          },
          {
                    "id": "mock-34",
                    "question": "In the first Left 4 Dead, you can play as either of these four characters.",
                    "correct_answer": "Francis, Bill, Zoey, and Louis",
                    "incorrect_answers": [
                              "Bender, Andrew, Allison, and Brian",
                              "Coach, Ellis, Nick, and Rochelle",
                              "Harry, Ron, Hermione and Dumbledore"
                    ]
          },
          {
                    "id": "mock-35",
                    "question": "Which gas forms about 78% of the Earth&rsquo;s atmosphere?",
                    "correct_answer": "Nitrogen",
                    "incorrect_answers": [
                              "Oxygen",
                              "Argon",
                              "Carbon Dioxide"
                    ]
          },
          {
                    "id": "mock-36",
                    "question": "How many members are there in the band Nirvana?",
                    "correct_answer": "Three",
                    "incorrect_answers": [
                              "Two",
                              "Four",
                              "Five"
                    ]
          },
          {
                    "id": "mock-37",
                    "question": "Which wrestler won the 2019 Men&rsquo;s Royal Rumble?",
                    "correct_answer": "Seth Rollins",
                    "incorrect_answers": [
                              "Braun Strowman",
                              "AJ Styles",
                              "Andrade"
                    ]
          },
          {
                    "id": "mock-38",
                    "question": "The character Plum from &quot;No Game No Life&quot; is of what race?",
                    "correct_answer": "Dhampir",
                    "incorrect_answers": [
                              "Fl&uuml;gel",
                              "Imanity",
                              "Seiren"
                    ]
          },
          {
                    "id": "mock-39",
                    "question": "Under which name was Rodrigo Borgia made Pope?",
                    "correct_answer": "Alexander VI",
                    "incorrect_answers": [
                              "Rodrigo I",
                              "John Paul II",
                              "Pius VII"
                    ]
          },
          {
                    "id": "mock-40",
                    "question": "In what year was &quot;Super Mario Sunshine&quot; released?",
                    "correct_answer": "2002",
                    "incorrect_answers": [
                              "2003",
                              "2000",
                              "2004"
                    ]
          },
          {
                    "id": "mock-41",
                    "question": "What game mode was not in the original &quot;Wii Sports&quot;?",
                    "correct_answer": "Table Tennis",
                    "incorrect_answers": [
                              "Boxing",
                              "Baseball",
                              "Bowling"
                    ]
          },
          {
                    "id": "mock-42",
                    "question": "In &quot;PAYDAY 2&quot;, what weapon has the highest base weapon damage on a per-shot basis?",
                    "correct_answer": "HRL-7",
                    "incorrect_answers": [
                              "Heavy Crossbow",
                              "Thanatos .50 cal",
                              "Broomstick Pistol"
                    ]
          },
          {
                    "id": "mock-43",
                    "question": "What is the highest belt you can get in Taekwondo?",
                    "correct_answer": "Black",
                    "incorrect_answers": [
                              "White",
                              "Red",
                              "Green"
                    ]
          },
          {
                    "id": "mock-44",
                    "question": "What is the name of the child performing the Black Sacrament, in The Elder Scrolls V: Skyrim?",
                    "correct_answer": "Aventus Aretino",
                    "incorrect_answers": [
                              "Proventus Avenicci",
                              "Aval Atheron",
                              "Arngeir"
                    ]
          },
          {
                    "id": "mock-45",
                    "question": "Which of these online games was originally named LindenWorld in it&#039;s early development?",
                    "correct_answer": "SecondLife",
                    "incorrect_answers": [
                              "ActiveWorlds",
                              "IMVU",
                              "HabboHotel"
                    ]
          },
          {
                    "id": "mock-46",
                    "question": "When did the British hand-over sovereignty of Hong Kong back to China?",
                    "correct_answer": "1997",
                    "incorrect_answers": [
                              "1999",
                              "1841",
                              "1900"
                    ]
          },
          {
                    "id": "mock-47",
                    "question": "What is the area of a circle with a diameter of 20 inches if &pi;= 3.1415?",
                    "correct_answer": "314.15 Inches",
                    "incorrect_answers": [
                              "380.1215 Inches",
                              "3141.5 Inches",
                              "1256.6 Inches"
                    ]
          },
          {
                    "id": "mock-48",
                    "question": "What is a fundamental element of the Gothic style of architecture?",
                    "correct_answer": "pointed arch",
                    "incorrect_answers": [
                              "coffered ceilings",
                              "fa&ccedil;ades surmounted by a pediment ",
                              "internal frescoes"
                    ]
          },
          {
                    "id": "mock-49",
                    "question": "In what year was the last natural case of smallpox documented?",
                    "correct_answer": "1977",
                    "incorrect_answers": [
                              "1982",
                              "1980",
                              "1990"
                    ]
          },
          {
                    "id": "mock-50",
                    "question": "When did Norway become free from Sweden?",
                    "correct_answer": "1905",
                    "incorrect_answers": [
                              "1925",
                              "1814",
                              "1834"
                    ]
          }
];
    }

    getCategoryId(category) {
        const categories = {
            'general': 9,
            'science': 17,
            'history': 23,
            'sports': 21,
            'entertainment': 11
        };
        return categories[category] || 9;
    }

    shuffleArray(array) {
        // Create copy to preserve immutability for question data
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

module.exports = new QuestionService();