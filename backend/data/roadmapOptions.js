import { BRANCHES, SEMESTER_COUNT } from './campusOptions.js';

/**
 * Semester Roadmap: career goals, branch tracks and every roadmap milestone, in one place. Only
 * services/roadmapService.js reads this file; students see it through /api/v1/roadmap and can never change
 * it (there is no write route for templates). Like data/campusOptions.js, it can later move to MongoDB
 * collections managed from the admin control center.
 *
 * These are suggested learning paths written by CampusX, not any university's official syllabus. They are
 * adapted to the student's branch (track) and chosen career goal. Every resource link was checked when it
 * was added (https only); a milestone without a checked link simply has no resources yet.
 */

/** Bumped whenever milestones are added, removed or re-scoped. Stored on each student's progress. */
export const ROADMAP_TEMPLATE_VERSION = 1;
export const ROADMAP_SEMESTERS = SEMESTER_COUNT;

export const MILESTONE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

/** What a student can set on a milestone. "not-started" removes the record. */
export const MILESTONE_STATUSES = Object.freeze(['not-started', 'in-progress', 'completed']);

export const MILESTONE_CATEGORIES = Object.freeze([
  { id: 'learn', label: 'Learn' },
  { id: 'practice', label: 'Practice' },
  { id: 'build', label: 'Build' },
  { id: 'career', label: 'Career' },
]);
export const DIFFICULTIES = Object.freeze([
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]);

/**
 * Semester states (derived, never stored):
 *   completed        every required milestone of the semester is complete
 *   in-progress      the student's current semester, or a later one they already started
 *   needs-attention  an earlier semester than the student's current one with required milestones still open
 *   upcoming         a later semester with nothing started yet
 */
export const SEMESTER_STATES = Object.freeze(['completed', 'in-progress', 'needs-attention', 'upcoming']);

/** Mutations (milestone status, preferences) per student. Reads use the general API limit. */
export const ROADMAP_RATE_LIMITS = Object.freeze({
  updates: { windowMinutes: 10, max: 150, message: 'You are updating your roadmap very quickly. Please wait a moment and try again.' },
});

/**
 * Career goals. `interests` / `branches` decide the suggested goal before a student picks one: the first
 * of the student's interests that a goal lists, then their branch, then Full Stack.
 */
export const CAREER_GOALS = Object.freeze([
  { id: 'full-stack', title: 'Full Stack Developer', journey: 'Full Stack Development', tagline: 'Build complete web apps, from the database to the interface.', icon: 'layers', interests: ['web-development'], branches: [] },
  { id: 'frontend', title: 'Frontend Developer', journey: 'Frontend Development', tagline: 'Craft fast, accessible interfaces people enjoy using.', icon: 'monitor', interests: ['ui-ux-design'], branches: [] },
  { id: 'backend', title: 'Backend Developer', journey: 'Backend Development', tagline: 'Design the APIs, databases and services behind every app.', icon: 'server', interests: ['cloud-computing'], branches: [] },
  { id: 'ai-ml', title: 'AI/ML Engineer', journey: 'AI and Machine Learning', tagline: 'Train models that learn from data and put them to work.', icon: 'brain', interests: ['ai-ml'], branches: ['aiml'] },
  { id: 'data-analyst', title: 'Data Analyst', journey: 'Data Analytics', tagline: 'Turn raw data into clear answers and better decisions.', icon: 'chart', interests: ['data-science'], branches: ['aids'] },
  { id: 'cybersecurity', title: 'Cybersecurity Analyst', journey: 'Cybersecurity', tagline: 'Protect systems and people by understanding how attacks work.', icon: 'shield', interests: ['cyber-security'], branches: [] },
  { id: 'mobile', title: 'Mobile App Developer', journey: 'Mobile App Development', tagline: 'Ship apps that live in your classmates’ pockets.', icon: 'smartphone', interests: ['app-development'], branches: [] },
]);
export const CAREER_GOAL_IDS = Object.freeze(CAREER_GOALS.map((goal) => goal.id));
export const DEFAULT_CAREER_GOAL = 'full-stack';

/**
 * Branch tracks. Computer science branches study most CS core subjects in their coursework; the others
 * learn them alongside their own branch, so a few CS core milestones are optional for them and they get
 * an optional "bridge" milestone that connects code to their branch.
 */
export const BRANCH_TRACKS = Object.freeze([
  { id: 'computing', label: 'Computer science track', branches: ['cse', 'it', 'aiml', 'aids'] },
  { id: 'electronics', label: 'Electronics and electrical track', branches: ['entc', 'electronics', 'electrical'] },
  { id: 'core', label: 'Core engineering track', branches: ['mechanical', 'civil', 'other'] },
]);
export const BRANCH_TRACK_IDS = Object.freeze(BRANCH_TRACKS.map((track) => track.id));

/** What each semester is about. `{journey}` is replaced with the goal's journey name. */
export const SEMESTER_FOCUS = Object.freeze({
  1: { title: 'Foundations', summary: 'Learn to code, solve small problems and ship your first project.' },
  2: { title: 'Core programming', summary: 'Object-oriented thinking, data structures and your first steps towards {journey}.' },
  3: { title: 'Computer science core', summary: 'Algorithms, databases and systems, plus a practical project.' },
  4: { title: 'Applied skills', summary: 'Networks, deeper problem solving and your first real {journey} project.' },
  5: { title: 'Specialise', summary: 'Go deep into {journey} with modern tools and a complete project.' },
  6: { title: 'Build and get noticed', summary: 'An advanced project, a portfolio that shows it, and internship preparation.' },
  7: { title: 'Placement preparation', summary: 'Interview practice, a reviewed resume and focused applications.' },
  8: { title: 'Launch', summary: 'Finish your final-year project, present your work and plan your next step.' },
});

// ----------------------------------------------------------------------------- resources

/** Checked links (https, publisher's own site). `kind`: docs, course, book, practice. */
const R = {
  pythonTutorial: { title: 'The Python Tutorial', source: 'Python docs', url: 'https://docs.python.org/3/tutorial/', kind: 'docs' },
  pythonClasses: { title: 'Classes in Python', source: 'Python docs', url: 'https://docs.python.org/3/tutorial/classes.html', kind: 'docs' },
  learnCpp: { title: 'Learn C++', source: 'LearnCpp.com', url: 'https://www.learncpp.com/', kind: 'course' },
  learnJava: { title: 'Learn Java', source: 'dev.java', url: 'https://dev.java/learn/', kind: 'course' },
  gitBook: { title: 'Pro Git (free book)', source: 'git-scm.com', url: 'https://git-scm.com/book/en/v2', kind: 'book' },
  githubStart: { title: 'Get started with GitHub', source: 'GitHub Docs', url: 'https://docs.github.com/en/get-started', kind: 'docs' },
  githubProfileReadme: { title: 'Managing your profile README', source: 'GitHub Docs', url: 'https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme', kind: 'docs' },
  githubPages: { title: 'GitHub Pages', source: 'GitHub Docs', url: 'https://docs.github.com/en/pages', kind: 'docs' },
  githubActions: { title: 'GitHub Actions', source: 'GitHub Docs', url: 'https://docs.github.com/en/actions', kind: 'docs' },
  mdnLearn: { title: 'Learn web development', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development', kind: 'course' },
  mdnJavaScript: { title: 'JavaScript Guide', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', kind: 'docs' },
  mdnHttp: { title: 'An overview of HTTP', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview', kind: 'docs' },
  mdnAccessibility: { title: 'Accessibility', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility', kind: 'docs' },
  webDevCss: { title: 'Learn CSS', source: 'web.dev', url: 'https://web.dev/learn/css', kind: 'course' },
  webDevAccessibility: { title: 'Learn Accessibility', source: 'web.dev', url: 'https://web.dev/learn/accessibility', kind: 'course' },
  react: { title: 'Learn React', source: 'react.dev', url: 'https://react.dev/learn', kind: 'docs' },
  typescript: { title: 'The TypeScript Handbook', source: 'typescriptlang.org', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', kind: 'docs' },
  node: { title: 'Introduction to Node.js', source: 'nodejs.org', url: 'https://nodejs.org/learn/getting-started/introduction-to-nodejs', kind: 'docs' },
  express: { title: 'Express routing guide', source: 'expressjs.com', url: 'https://expressjs.com/en/guide/routing/', kind: 'docs' },
  mongodb: { title: 'MongoDB Manual', source: 'MongoDB Docs', url: 'https://www.mongodb.com/docs/manual/', kind: 'docs' },
  postgresTutorial: { title: 'PostgreSQL tutorial', source: 'PostgreSQL docs', url: 'https://www.postgresql.org/docs/current/tutorial.html', kind: 'docs' },
  postgresWindow: { title: 'Window functions', source: 'PostgreSQL docs', url: 'https://www.postgresql.org/docs/current/tutorial-window.html', kind: 'docs' },
  owaspTopTen: { title: 'OWASP Top 10', source: 'OWASP', url: 'https://owasp.org/projects/top-ten', kind: 'docs' },
  owaspApi: { title: 'OWASP API Security Top 10', source: 'OWASP', url: 'https://api-security.owasp.org/', kind: 'docs' },
  owaspCheatSheets: { title: 'OWASP Cheat Sheet Series', source: 'OWASP', url: 'https://cheatsheetseries.owasp.org/', kind: 'docs' },
  owaspCrypto: { title: 'Cryptographic Storage Cheat Sheet', source: 'OWASP', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html', kind: 'docs' },
  juiceShop: { title: 'OWASP Juice Shop (practice app you run yourself)', source: 'OWASP', url: 'https://owasp.org/projects/juice-shop', kind: 'practice' },
  numpy: { title: 'NumPy: the absolute basics', source: 'NumPy docs', url: 'https://numpy.org/doc/stable/user/absolute_beginners.html', kind: 'docs' },
  pandas: { title: 'Getting started with pandas', source: 'pandas docs', url: 'https://pandas.pydata.org/docs/getting_started/index.html', kind: 'docs' },
  matplotlib: { title: 'Matplotlib tutorials', source: 'Matplotlib docs', url: 'https://matplotlib.org/stable/tutorials/index.html', kind: 'docs' },
  sklearn: { title: 'Getting started with scikit-learn', source: 'scikit-learn docs', url: 'https://scikit-learn.org/stable/getting_started.html', kind: 'docs' },
  sklearnModelSelection: { title: 'Model selection and evaluation', source: 'scikit-learn docs', url: 'https://scikit-learn.org/stable/model_selection.html', kind: 'docs' },
  pytorch: { title: 'Learn the basics of PyTorch', source: 'PyTorch tutorials', url: 'https://docs.pytorch.org/tutorials/beginner/basics/intro.html', kind: 'course' },
  kaggleLearn: { title: 'Kaggle Learn courses', source: 'Kaggle', url: 'https://www.kaggle.com/learn', kind: 'course' },
  mitLinearAlgebra: { title: 'Linear Algebra (18.06)', source: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/', kind: 'course' },
  mitAlgorithms: { title: 'Introduction to Algorithms (6.006)', source: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/', kind: 'course' },
  khanStatistics: { title: 'Statistics and probability', source: 'Khan Academy', url: 'https://www.khanacademy.org/math/statistics-probability', kind: 'course' },
  powerBi: { title: 'Power BI training', source: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/training/powerplatform/power-bi', kind: 'course' },
  excel: { title: 'Excel help and learning', source: 'Microsoft Support', url: 'https://support.microsoft.com/en-us/excel/', kind: 'docs' },
  kotlin: { title: 'Get started with Kotlin', source: 'kotlinlang.org', url: 'https://kotlinlang.org/docs/getting-started.html', kind: 'docs' },
  dart: { title: 'Introduction to Dart', source: 'dart.dev', url: 'https://dart.dev/language', kind: 'docs' },
  flutter: { title: 'Get started with Flutter', source: 'Flutter docs', url: 'https://docs.flutter.dev/install', kind: 'docs' },
  flutterNetworking: { title: 'Fetch data from the internet', source: 'Flutter docs', url: 'https://docs.flutter.dev/cookbook/networking/fetch-data', kind: 'docs' },
  flutterState: { title: 'State management', source: 'Flutter docs', url: 'https://docs.flutter.dev/data-and-backend/state-mgmt/intro', kind: 'docs' },
  flutterAndroidRelease: { title: 'Build and release an Android app', source: 'Flutter docs', url: 'https://docs.flutter.dev/deployment/android', kind: 'docs' },
  ubuntuCommandLine: { title: 'The Linux command line for beginners', source: 'Ubuntu tutorials', url: 'https://ubuntu.com/tutorials/command-line-for-beginners', kind: 'course' },
  bandit: { title: 'Bandit wargame', source: 'OverTheWire', url: 'https://overthewire.org/wargames/bandit/', kind: 'practice' },
  picoCtf: { title: 'picoCTF', source: 'Carnegie Mellon University', url: 'https://picoctf.org/', kind: 'practice' },
  wireshark: { title: 'Wireshark User’s Guide', source: 'wireshark.org', url: 'https://www.wireshark.org/docs/wsug_html_chunked/', kind: 'docs' },
  nmap: { title: 'Nmap reference guide', source: 'nmap.org', url: 'https://nmap.org/book/man.html', kind: 'docs' },
  docker: { title: 'Get started with Docker', source: 'Docker Docs', url: 'https://docs.docker.com/get-started/', kind: 'docs' },
  vitest: { title: 'Getting started with Vitest', source: 'vitest.dev', url: 'https://vitest.dev/guide/', kind: 'docs' },
  systemDesignPrimer: { title: 'The System Design Primer', source: 'GitHub', url: 'https://github.com/donnemartin/system-design-primer', kind: 'book' },
  cpAlgorithms: { title: 'Algorithms for Competitive Programming', source: 'cp-algorithms.com', url: 'https://cp-algorithms.com/', kind: 'docs' },
  ostep: { title: 'Operating Systems: Three Easy Pieces (free book)', source: 'University of Wisconsin', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/', kind: 'book' },
  systemsApproach: { title: 'Computer Networks: A Systems Approach (free book)', source: 'systemsapproach.org', url: 'https://book.systemsapproach.org/', kind: 'book' },
  crypto101: { title: 'Crypto 101 (free book)', source: 'crypto101.io', url: 'https://www.crypto101.io/', kind: 'book' },
  interviewHandbook: { title: 'Tech Interview Handbook', source: 'techinterviewhandbook.org', url: 'https://www.techinterviewhandbook.org/', kind: 'docs' },
  resumeGuide: { title: 'Resume guide', source: 'Tech Interview Handbook', url: 'https://www.techinterviewhandbook.org/resume/', kind: 'docs' },
  behavioralGuide: { title: 'Behavioral interviews', source: 'Tech Interview Handbook', url: 'https://www.techinterviewhandbook.org/behavioral-interview/', kind: 'docs' },
  fastapi: { title: 'FastAPI tutorial', source: 'fastapi.tiangolo.com', url: 'https://fastapi.tiangolo.com/tutorial/', kind: 'docs' },
  mlflow: { title: 'MLflow documentation', source: 'mlflow.org', url: 'https://mlflow.org/docs/latest/index.html', kind: 'docs' },
  arduino: { title: 'Arduino learning resources', source: 'Arduino Docs', url: 'https://docs.arduino.cc/learn/', kind: 'docs' },
};

/** Pages inside CampusX a milestone can point to (kind "campusx"). Only these paths are allowed. */
export const CAMPUSX_PATHS = Object.freeze(['/opportunities', '/opportunities/my', '/projects/create', '/achievements/create', '/communities', '/profile/edit']);
const C = {
  addProject: { title: 'Add it to Things I’ve Built', path: '/projects/create', kind: 'campusx' },
  addAchievement: { title: 'Add it to My Wins', path: '/achievements/create', kind: 'campusx' },
  opportunities: { title: 'Find internships on CampusX', path: '/opportunities', kind: 'campusx' },
  myOpportunities: { title: 'Track your applications', path: '/opportunities/my', kind: 'campusx' },
  communities: { title: 'Ask seniors in your communities', path: '/communities', kind: 'campusx' },
  editProfile: { title: 'Update your CampusX profile', path: '/profile/edit', kind: 'campusx' },
};

// ----------------------------------------------------------------------------- milestones

const WEB = ['full-stack', 'frontend', 'backend'];
const DATA = ['ai-ml', 'data-analyst'];
const NON_CS = ['electronics', 'core'];

/**
 * Every milestone. Fields:
 *   id            stable, never reused (progress is stored by id)
 *   semester      1–8
 *   category      learn | practice | build | career
 *   difficulty    beginner | intermediate | advanced
 *   effortHours   a rough estimate for planning, not a requirement
 *   goals         career goals it belongs to (missing = every goal)
 *   tracks        branch tracks it belongs to (missing = every track)
 *   optionalFor   { tracks?, goals? }: optional (doesn't count towards progress) for these students...
 *   requiredFor   { goals? }: ...unless their goal is listed here
 *   variants      per-goal changes ({ goals: { [goal]: {...} } }), e.g. a goal-specific project idea
 *   prerequisites milestone ids it builds on (shown as "Builds on", never locked)
 */
export const MILESTONES = Object.freeze([
  // ------------------------------------------------------------------------- Semester 1
  {
    id: 's1-programming-fundamentals',
    semester: 1,
    title: 'Programming fundamentals',
    summary: 'Get comfortable with one programming language. The one your coursework uses (C, C++, Python or Java) is a good choice.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 40,
    objectives: ['Use variables, data types and operators', 'Write conditions and loops', 'Break code into functions', 'Work with arrays and strings'],
    skills: ['Programming'],
    resources: [R.pythonTutorial, R.learnCpp, R.learnJava],
  },
  {
    id: 's1-problem-solving',
    semester: 1,
    title: 'Problem-solving basics',
    summary: 'Turn a problem statement into clear steps before you code, then practise on small problems.',
    category: 'practice',
    difficulty: 'beginner',
    effortHours: 25,
    objectives: ['Write pseudocode and dry-run it by hand', 'Solve about 25 beginner problems', 'Test your code with edge cases'],
    skills: ['Problem Solving'],
    prerequisites: ['s1-programming-fundamentals'],
  },
  {
    id: 's1-git-github',
    semester: 1,
    title: 'Git and GitHub introduction',
    summary: 'Version control is how every software team works. Start using it for all your code now.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 8,
    objectives: ['Create a repository and make meaningful commits', 'Use branches and merge them', 'Push your code to GitHub', 'Write a helpful README'],
    skills: ['Git', 'GitHub'],
    resources: [R.gitBook, R.githubStart],
  },
  {
    id: 's1-first-project',
    semester: 1,
    title: 'Small programming project',
    summary: 'Build something small from start to finish and put it on GitHub.',
    category: 'build',
    difficulty: 'beginner',
    effortHours: 15,
    skills: ['Programming', 'Git'],
    project: { title: 'A command-line tool you would actually use', description: 'For example a marks calculator, a quiz, a unit converter or an expense tracker. Keep it small, finish it, and push it to GitHub with a README.' },
    resources: [C.addProject],
    prerequisites: ['s1-programming-fundamentals', 's1-git-github'],
  },

  // ------------------------------------------------------------------------- Semester 2
  {
    id: 's2-oop',
    semester: 2,
    title: 'Object-oriented programming',
    summary: 'Model real things in code with classes and objects, the way most large programs are organised.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 30,
    objectives: ['Write classes with fields and methods', 'Use encapsulation to protect data', 'Apply inheritance and polymorphism', 'Model a small real-world system'],
    skills: ['OOP'],
    resources: [R.learnJava, R.pythonClasses, R.learnCpp],
    prerequisites: ['s1-programming-fundamentals'],
  },
  {
    id: 's2-data-structures',
    semester: 2,
    title: 'Data structures fundamentals',
    summary: 'Learn the building blocks every program uses to store and find data quickly.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 35,
    objectives: ['Use arrays, linked lists, stacks and queues', 'Understand hashing and hash maps', 'Estimate running time with Big-O'],
    skills: ['Data Structures'],
    resources: [R.mitAlgorithms],
    prerequisites: ['s1-programming-fundamentals'],
  },
  {
    id: 's2-web-basics',
    semester: 2,
    goals: WEB,
    title: 'Basic web development',
    summary: 'Build and publish simple web pages with HTML, CSS and a little JavaScript.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 30,
    objectives: ['Structure pages with semantic HTML', 'Lay them out with CSS flexbox and grid', 'Add interactivity with JavaScript and the DOM', 'Publish a page online'],
    skills: ['HTML', 'CSS', 'JavaScript'],
    resources: [R.mdnLearn, R.webDevCss, R.githubPages],
  },
  {
    id: 's2-python-for-data',
    semester: 2,
    goals: DATA,
    title: 'Python for data',
    summary: 'Python is the common language of data work. Learn it with the libraries analysts use every day.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 30,
    objectives: ['Write Python scripts and notebooks', 'Work with NumPy arrays', 'Load, filter and summarise data with pandas'],
    skills: ['Python', 'NumPy', 'pandas'],
    resources: [R.pythonTutorial, R.numpy, R.pandas],
  },
  {
    id: 's2-linux-command-line',
    semester: 2,
    goals: ['cybersecurity'],
    title: 'Linux and the command line',
    summary: 'Security work happens in the terminal. Get fluent with Linux.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 20,
    objectives: ['Navigate the file system and manage files', 'Understand users, groups and permissions', 'Inspect processes and services', 'Write small shell scripts'],
    skills: ['Linux', 'Bash'],
    resources: [R.ubuntuCommandLine, R.bandit],
  },
  {
    id: 's2-mobile-language',
    semester: 2,
    goals: ['mobile'],
    title: 'Kotlin or Dart basics',
    summary: 'Learn the language behind modern Android (Kotlin) or cross-platform Flutter apps (Dart).',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 30,
    objectives: ['Write programs in Kotlin or Dart', 'Use null safety and collections', 'Organise code with classes and functions'],
    skills: ['Kotlin', 'Dart'],
    resources: [R.kotlin, R.dart],
  },
  {
    id: 's2-mini-project',
    semester: 2,
    title: 'Mini project',
    summary: 'Put object-oriented design into practice in a project you can explain to anyone.',
    category: 'build',
    difficulty: 'beginner',
    effortHours: 20,
    skills: ['OOP'],
    project: { title: 'A small management system', description: 'For example a library, hostel or canteen system with classes for each kind of thing it manages.' },
    resources: [C.addProject],
    prerequisites: ['s2-oop'],
    variants: {
      goals: {
        'full-stack': { project: { title: 'Your personal web page', description: 'A portfolio or a page for your club’s next event, built with HTML, CSS and JavaScript and published on GitHub Pages.' }, skills: ['HTML', 'CSS'], prerequisites: ['s2-web-basics'] },
        frontend: { project: { title: 'Your personal web page', description: 'A portfolio or a page for your club’s next event, built with HTML, CSS and JavaScript and published on GitHub Pages.' }, skills: ['HTML', 'CSS'], prerequisites: ['s2-web-basics'] },
        'ai-ml': { project: { title: 'Explore a dataset', description: 'Pick a public dataset you care about (sports, weather, movies) and answer three questions about it in a notebook.' }, skills: ['Python', 'pandas'], prerequisites: ['s2-python-for-data'] },
        'data-analyst': { project: { title: 'Explore a dataset', description: 'Pick a public dataset you care about (sports, weather, movies) and answer three questions about it in a notebook.' }, skills: ['Python', 'pandas'], prerequisites: ['s2-python-for-data'] },
        cybersecurity: { project: { title: 'Automate a Linux task', description: 'A shell or Python script that backs up a folder, checks file permissions or summarises a log file on your own machine.' }, skills: ['Linux', 'Bash'], prerequisites: ['s2-linux-command-line'] },
        mobile: { project: { title: 'A Kotlin or Dart console app', description: 'A to-do list or a quiz in Kotlin or Dart, ready to grow into a mobile app next semester.' }, skills: ['Kotlin', 'Dart'], prerequisites: ['s2-mobile-language'] },
      },
    },
  },

  // ------------------------------------------------------------------------- Semester 3
  {
    id: 's3-dsa',
    semester: 3,
    title: 'Data structures and algorithms',
    summary: 'Trees, graphs and the classic algorithms: the core of technical interviews and efficient code.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 50,
    objectives: ['Use trees, heaps and graphs', 'Write recursive solutions', 'Apply sorting, searching, BFS and DFS', 'Analyse time and space complexity'],
    skills: ['DSA'],
    resources: [R.mitAlgorithms, R.cpAlgorithms],
    prerequisites: ['s2-data-structures'],
  },
  {
    id: 's3-dbms-sql',
    semester: 3,
    title: 'DBMS and SQL',
    summary: 'Almost every application stores data. Learn how relational databases work and how to query them.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Design tables with an ER diagram', 'Normalise a schema', 'Write joins, aggregates and subqueries', 'Understand indexes and transactions'],
    skills: ['SQL', 'DBMS'],
    resources: [R.postgresTutorial],
  },
  {
    id: 's3-operating-systems',
    semester: 3,
    title: 'Operating systems fundamentals',
    summary: 'Understand what happens underneath your programs: processes, memory and files.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Explain processes and threads', 'Compare CPU scheduling approaches', 'Reason about synchronisation and deadlocks', 'Understand virtual memory and paging'],
    skills: ['Operating Systems'],
    resources: [R.ostep],
    optionalFor: { tracks: NON_CS },
    requiredFor: { goals: ['cybersecurity'] },
  },
  {
    id: 's3-modern-javascript',
    semester: 3,
    goals: WEB,
    title: 'Modern JavaScript',
    summary: 'Write the JavaScript that modern frontends and Node.js backends are built with.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Use ES modules, destructuring and array methods', 'Handle asynchronous code with promises and async/await', 'Fetch JSON from an API', 'Debug with browser developer tools'],
    skills: ['JavaScript'],
    resources: [R.mdnJavaScript],
    prerequisites: ['s2-web-basics'],
  },
  {
    id: 's3-math-for-ml',
    semester: 3,
    goals: ['ai-ml'],
    title: 'Maths for machine learning',
    summary: 'The linear algebra, probability and statistics that make machine learning make sense.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 35,
    objectives: ['Work with vectors and matrices', 'Use probability and common distributions', 'Understand gradients and optimisation intuitively'],
    skills: ['Linear Algebra', 'Statistics'],
    resources: [R.mitLinearAlgebra, R.khanStatistics],
  },
  {
    id: 's3-statistics-spreadsheets',
    semester: 3,
    goals: ['data-analyst'],
    title: 'Statistics and spreadsheets',
    summary: 'Describe data honestly and work fast in spreadsheets, the tools every analyst uses daily.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 30,
    objectives: ['Summarise data with descriptive statistics', 'Understand distributions and sampling', 'Run a basic hypothesis test', 'Use pivot tables, lookups and charts'],
    skills: ['Statistics', 'Excel'],
    resources: [R.khanStatistics, R.excel],
  },
  {
    id: 's3-security-fundamentals',
    semester: 3,
    goals: ['cybersecurity'],
    title: 'Security fundamentals',
    summary: 'The core ideas of security and the most common ways applications get attacked.',
    category: 'learn',
    difficulty: 'beginner',
    effortHours: 25,
    objectives: ['Explain confidentiality, integrity and availability', 'Tell authentication from authorisation', 'Know hashing from encryption', 'Recognise the OWASP Top 10 risks'],
    skills: ['Security Fundamentals'],
    resources: [R.owaspTopTen, R.owaspCheatSheets],
  },
  {
    id: 's3-first-mobile-app',
    semester: 3,
    goals: ['mobile'],
    title: 'Your first mobile app',
    summary: 'Build and run a real app on a phone or emulator.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Build screens and layouts', 'Navigate between screens', 'Keep and update app state', 'Run the app on a device or emulator'],
    skills: ['Flutter', 'Mobile Development'],
    resources: [R.flutter, R.kotlin],
    prerequisites: ['s2-mobile-language'],
  },
  {
    id: 's3-branch-bridge-electronics',
    semester: 3,
    tracks: ['electronics'],
    optionalFor: { tracks: ['electronics'] },
    title: 'Bridge: code meets hardware',
    summary: 'Connect your branch with software: program a microcontroller and send sensor data to a simple app.',
    category: 'build',
    difficulty: 'intermediate',
    effortHours: 20,
    skills: ['Embedded Systems', 'IoT'],
    project: { title: 'A sensor dashboard', description: 'Read a temperature or light sensor with a microcontroller and show the readings in a small web or mobile page.' },
    resources: [R.arduino],
  },
  {
    id: 's3-branch-bridge-core',
    semester: 3,
    tracks: ['core'],
    optionalFor: { tracks: ['core'] },
    title: 'Bridge: code for your branch',
    summary: 'Use programming on problems from your own subjects. It makes both easier and stands out in interviews.',
    category: 'build',
    difficulty: 'intermediate',
    effortHours: 20,
    skills: ['Python', 'Data Analysis'],
    project: { title: 'Automate a lab calculation', description: 'Write a script that does a repetitive calculation from your lab work, or analyses experiment readings and plots them.' },
    resources: [R.pythonTutorial, R.pandas],
  },
  {
    id: 's3-practical-project',
    semester: 3,
    title: 'Practical coding project',
    summary: 'Solve a real problem with what you have learned so far.',
    category: 'build',
    difficulty: 'intermediate',
    effortHours: 25,
    project: { title: 'Solve a campus problem with code', description: 'Pick something that annoys you or your friends on campus and build a tool that makes it easier.' },
    resources: [C.addProject],
    variants: {
      goals: {
        'full-stack': { project: { title: 'An interactive web app', description: 'A quiz, timetable planner or expense tracker in JavaScript that saves its data in the browser.' }, skills: ['JavaScript'], prerequisites: ['s3-modern-javascript'] },
        frontend: { project: { title: 'An interactive web app', description: 'A quiz, timetable planner or expense tracker in JavaScript that saves its data in the browser.' }, skills: ['JavaScript'], prerequisites: ['s3-modern-javascript'] },
        backend: { project: { title: 'A data-driven command-line service', description: 'A Node.js tool that reads and writes data to a SQL database, such as a book-lending log for your hostel.' }, skills: ['JavaScript', 'SQL'], prerequisites: ['s3-modern-javascript', 's3-dbms-sql'] },
        'ai-ml': { project: { title: 'Analyse a public dataset', description: 'Clean a dataset in a notebook and present three findings with charts and the statistics behind them.' }, skills: ['Python', 'Statistics'], prerequisites: ['s3-math-for-ml'] },
        'data-analyst': { project: { title: 'Analyse a public dataset', description: 'Clean a dataset in a notebook and present three findings with charts and the statistics behind them.' }, skills: ['Python', 'Statistics'], prerequisites: ['s3-statistics-spreadsheets'] },
        cybersecurity: { project: { title: 'A password-strength checker', description: 'A tool that scores passwords and explains why, or verifies file hashes. Run it only on your own machine and data.' }, skills: ['Security Fundamentals'], prerequisites: ['s3-security-fundamentals'] },
        mobile: { project: { title: 'A two-screen utility app', description: 'An attendance or to-do tracker with a list screen and a detail screen.' }, skills: ['Mobile Development'], prerequisites: ['s3-first-mobile-app'] },
      },
    },
  },

  // ------------------------------------------------------------------------- Semester 4
  {
    id: 's4-computer-networks',
    semester: 4,
    title: 'Computer networks',
    summary: 'How data travels from one device to another, and how the web is built on top of it.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Explain the TCP/IP and OSI layers', 'Work with IP addresses and subnets', 'Compare TCP and UDP', 'Trace a request through DNS and HTTP(S)'],
    skills: ['Computer Networks'],
    resources: [R.systemsApproach, R.mdnHttp],
    optionalFor: { tracks: ['core'] },
    requiredFor: { goals: ['cybersecurity', 'backend'] },
  },
  {
    id: 's4-dsa-practice',
    semester: 4,
    title: 'Advanced DSA practice',
    summary: 'Regular practice turns algorithms into instinct. Aim for steady progress, not speed.',
    category: 'practice',
    difficulty: 'intermediate',
    effortHours: 40,
    objectives: ['Solve dynamic programming and greedy problems', 'Use shortest-path and other graph algorithms', 'Work through about 60 medium problems this semester'],
    skills: ['DSA'],
    resources: [R.cpAlgorithms],
    prerequisites: ['s3-dsa'],
    optionalFor: { goals: ['data-analyst'] },
  },
  {
    id: 's4-api-database',
    semester: 4,
    goals: ['full-stack', 'backend'],
    title: 'API and database fundamentals',
    summary: 'Learn how apps talk to servers, and how servers store data safely.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Use HTTP methods and status codes correctly', 'Design RESTful endpoints', 'Build routes with Express', 'Connect an API to a database and validate input'],
    skills: ['REST APIs', 'Express.js', 'Databases'],
    resources: [R.mdnHttp, R.express, R.mongodb],
    prerequisites: ['s3-modern-javascript', 's3-dbms-sql'],
  },
  {
    id: 's4-responsive-accessible-ui',
    semester: 4,
    goals: ['frontend'],
    title: 'Responsive and accessible UI',
    summary: 'Interfaces that work on every screen and for everyone, including keyboard and screen-reader users.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Build layouts that adapt from phone to desktop', 'Use semantic HTML and labels', 'Support keyboard navigation and visible focus', 'Check colour contrast'],
    skills: ['CSS', 'Accessibility'],
    resources: [R.webDevCss, R.webDevAccessibility, R.mdnAccessibility],
    prerequisites: ['s2-web-basics'],
  },
  {
    id: 's4-machine-learning-basics',
    semester: 4,
    goals: ['ai-ml'],
    title: 'Machine learning foundations',
    summary: 'Classic machine learning with scikit-learn: the base every AI engineer builds on.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 40,
    objectives: ['Train regression and classification models', 'Split data and cross-validate', 'Choose metrics that fit the problem', 'Spot and reduce overfitting'],
    skills: ['Machine Learning', 'scikit-learn'],
    resources: [R.sklearn, R.kaggleLearn],
    prerequisites: ['s3-math-for-ml', 's2-python-for-data'],
  },
  {
    id: 's4-data-cleaning-visualisation',
    semester: 4,
    goals: ['data-analyst'],
    title: 'Data cleaning and visualisation',
    summary: 'Real data is messy. Learn to clean it and show what it says with clear charts.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Handle missing values and outliers', 'Join and reshape tables with pandas', 'Choose the right chart for each question'],
    skills: ['pandas', 'Data Visualisation'],
    resources: [R.pandas, R.matplotlib],
    prerequisites: ['s2-python-for-data'],
  },
  {
    id: 's4-web-security-lab',
    semester: 4,
    goals: ['cybersecurity'],
    title: 'Web security in a practice lab',
    summary: 'Find and fix common vulnerabilities in a deliberately vulnerable app you run yourself. Only ever test systems you own or have written permission to test.',
    category: 'practice',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Set up a local practice lab', 'Find OWASP Top 10 issues such as injection and broken access control', 'Write up each issue with its fix'],
    skills: ['Web Security'],
    resources: [R.juiceShop, R.owaspTopTen],
    prerequisites: ['s3-security-fundamentals'],
  },
  {
    id: 's4-mobile-data',
    semester: 4,
    goals: ['mobile'],
    title: 'Mobile apps with data',
    summary: 'Real apps load data from the internet and keep working when the connection is slow.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Call a REST API from an app', 'Store data on the device', 'Show loading, empty and error states'],
    skills: ['REST APIs', 'Mobile Development'],
    resources: [R.flutterNetworking],
    prerequisites: ['s3-first-mobile-app'],
  },
  {
    id: 's4-mini-project',
    semester: 4,
    title: 'Mini project',
    summary: 'Your first project in the field you are aiming for.',
    category: 'build',
    difficulty: 'intermediate',
    effortHours: 30,
    project: { title: 'A focused mini project', description: 'Build something small in your chosen field and document how it works.' },
    resources: [C.addProject],
    variants: {
      goals: {
        'full-stack': { title: 'Full-stack mini project', project: { title: 'A notes or club-events app', description: 'A small app with an Express API, a database and a simple web page that creates, lists and deletes items.' }, skills: ['REST APIs', 'JavaScript'], prerequisites: ['s4-api-database'] },
        frontend: { title: 'Frontend mini project', project: { title: 'A responsive dashboard page', description: 'A multi-section page that fetches data from a public API, works on any screen size and passes a keyboard-only test.' }, skills: ['CSS', 'JavaScript', 'Accessibility'], prerequisites: ['s4-responsive-accessible-ui'] },
        backend: { title: 'Backend mini project', project: { title: 'A REST API', description: 'An API for a campus noticeboard with validation, error handling and a database.' }, skills: ['REST APIs', 'Databases'], prerequisites: ['s4-api-database'] },
        'ai-ml': { title: 'Machine learning mini project', project: { title: 'Predict something useful', description: 'Train and evaluate a model on a public dataset, for example predicting house prices or classifying messages, and explain your metric.' }, skills: ['Machine Learning'], prerequisites: ['s4-machine-learning-basics'] },
        'data-analyst': { title: 'Analysis mini project', project: { title: 'A data story', description: 'Clean a messy public dataset and write a short report with four charts that answer one clear question.' }, skills: ['pandas', 'Data Visualisation'], prerequisites: ['s4-data-cleaning-visualisation'] },
        cybersecurity: { title: 'Security tool mini project', project: { title: 'A log analyser', description: 'A script that scans web-server logs from your own lab and flags suspicious patterns like repeated failed logins.' }, skills: ['Security Fundamentals', 'Bash'], prerequisites: ['s4-web-security-lab'] },
        mobile: { title: 'Mobile mini project', project: { title: 'A news or weather app', description: 'An app that loads data from a public API, caches it for offline use and handles errors gracefully.' }, skills: ['Mobile Development', 'REST APIs'], prerequisites: ['s4-mobile-data'] },
      },
    },
  },

  // ------------------------------------------------------------------------- Semester 5
  {
    id: 's5-react',
    semester: 5,
    goals: ['full-stack', 'frontend'],
    title: 'React and modern frontend development',
    summary: 'Build interfaces from components, the way most modern web apps are made.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 40,
    objectives: ['Build components with props and state', 'Use hooks such as useState and useEffect', 'Add routing and forms', 'Load data from an API with loading and error states'],
    skills: ['React'],
    resources: [R.react],
    prerequisites: ['s3-modern-javascript'],
  },
  {
    id: 's5-typescript',
    semester: 5,
    goals: ['frontend'],
    title: 'TypeScript',
    summary: 'Catch mistakes before your users do with typed JavaScript.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Type variables, functions and objects', 'Use unions, generics and narrowing', 'Type React components and API data'],
    skills: ['TypeScript'],
    resources: [R.typescript],
    prerequisites: ['s3-modern-javascript'],
  },
  {
    id: 's5-node-backend',
    semester: 5,
    goals: ['full-stack', 'backend'],
    title: 'Node.js and backend development',
    summary: 'Run JavaScript on the server and structure a backend that is easy to grow.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 35,
    objectives: ['Use the Node.js runtime and npm', 'Organise an Express app with routes, controllers and services', 'Configure environments and handle errors', 'Log what your server does'],
    skills: ['Node.js', 'Express.js'],
    resources: [R.node, R.express],
    prerequisites: ['s4-api-database'],
  },
  {
    id: 's5-mongodb-rest',
    semester: 5,
    goals: ['full-stack', 'backend'],
    title: 'MongoDB and REST APIs',
    summary: 'Design document data and expose it through clean, validated REST endpoints.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 30,
    objectives: ['Model documents and relationships', 'Add indexes for common queries', 'Implement CRUD with validation', 'Paginate and filter results'],
    skills: ['MongoDB', 'REST APIs'],
    resources: [R.mongodb],
    prerequisites: ['s4-api-database'],
  },
  {
    id: 's5-auth-security',
    semester: 5,
    goals: ['backend'],
    title: 'Authentication and API security',
    summary: 'Keep users’ accounts and data safe: the part of backend work that matters most.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Hash passwords properly', 'Compare sessions and tokens', 'Enforce role-based authorisation on the server', 'Add rate limiting and input validation'],
    skills: ['Authentication', 'API Security'],
    resources: [R.owaspApi, R.owaspCheatSheets],
    prerequisites: ['s5-node-backend'],
  },
  {
    id: 's5-deep-learning',
    semester: 5,
    goals: ['ai-ml'],
    title: 'Deep learning',
    summary: 'Neural networks power modern AI. Learn how to build and train them.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 45,
    objectives: ['Explain how neural networks learn', 'Write a training loop in PyTorch', 'Train an image or text model', 'Use a GPU notebook efficiently'],
    skills: ['Deep Learning', 'PyTorch'],
    resources: [R.pytorch],
    prerequisites: ['s4-machine-learning-basics'],
  },
  {
    id: 's5-ml-experiments',
    semester: 5,
    goals: ['ai-ml'],
    title: 'Model evaluation and experiments',
    summary: 'Good ML engineers compare fairly, track experiments and report results honestly.',
    category: 'practice',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Start from a simple baseline', 'Tune hyperparameters without leaking test data', 'Track experiments and their results', 'Report what did and didn’t work'],
    skills: ['Machine Learning'],
    resources: [R.sklearnModelSelection, R.mlflow],
    prerequisites: ['s4-machine-learning-basics'],
  },
  {
    id: 's5-advanced-sql',
    semester: 5,
    goals: ['data-analyst'],
    title: 'Advanced SQL for analysis',
    summary: 'The SQL analysts use every day to answer business questions directly from the database.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Write CTEs and window functions', 'Build cohort and funnel queries', 'Read a query plan to speed up slow queries'],
    skills: ['SQL'],
    resources: [R.postgresWindow],
    prerequisites: ['s3-dbms-sql'],
  },
  {
    id: 's5-dashboards',
    semester: 5,
    goals: ['data-analyst'],
    title: 'Dashboards and data storytelling',
    summary: 'Turn analysis into dashboards and stories that non-technical people can act on.',
    category: 'learn',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Choose the few metrics that matter', 'Build an interactive dashboard in a BI tool', 'Present insights in plain language'],
    skills: ['Power BI', 'Data Storytelling'],
    resources: [R.powerBi],
    prerequisites: ['s4-data-cleaning-visualisation'],
  },
  {
    id: 's5-network-security',
    semester: 5,
    goals: ['cybersecurity'],
    title: 'Network security',
    summary: 'See what travels over a network and how to defend it. Practise only on your own lab network.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 30,
    objectives: ['Capture and read packets with Wireshark', 'Scan your own lab with Nmap', 'Explain firewalls and VPNs', 'Recognise common network attacks and their defences'],
    skills: ['Network Security', 'Wireshark', 'Nmap'],
    resources: [R.wireshark, R.nmap],
    prerequisites: ['s4-computer-networks'],
  },
  {
    id: 's5-cryptography',
    semester: 5,
    goals: ['cybersecurity'],
    title: 'Applied cryptography basics',
    summary: 'How encryption actually protects data, and the mistakes that break it.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 20,
    objectives: ['Compare symmetric and asymmetric encryption', 'Use hashing and salting correctly', 'Follow a TLS handshake', 'Explain why you shouldn’t invent your own crypto'],
    skills: ['Cryptography'],
    resources: [R.crypto101, R.owaspCrypto],
    prerequisites: ['s3-security-fundamentals'],
  },
  {
    id: 's5-mobile-architecture',
    semester: 5,
    goals: ['mobile'],
    title: 'App architecture and state',
    summary: 'Structure an app so it stays easy to change as it grows.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 30,
    objectives: ['Separate UI, state and data layers', 'Choose a state management approach', 'Design for offline use'],
    skills: ['Mobile Architecture'],
    resources: [R.flutterState],
    prerequisites: ['s4-mobile-data'],
  },
  {
    id: 's5-mobile-backend',
    semester: 5,
    goals: ['mobile'],
    title: 'Sign-in and backend integration',
    summary: 'Real apps have accounts. Connect yours to a backend securely.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Build sign-up and sign-in flows', 'Store tokens securely on the device', 'Handle slow and failing networks gracefully'],
    skills: ['Authentication', 'Mobile Development'],
    resources: [R.owaspCheatSheets],
    prerequisites: ['s4-mobile-data'],
  },
  {
    id: 's5-capstone-project',
    semester: 5,
    title: 'Complete project',
    summary: 'A complete, deployed project that shows everything you learned this year.',
    category: 'build',
    difficulty: 'advanced',
    effortHours: 50,
    resources: [C.addProject],
    variants: {
      goals: {
        'full-stack': { title: 'Full-stack project', project: { title: 'A complete MERN app', description: 'Sign-up and login, a database, a REST API and a React interface. For example a lost-and-found board or an event manager for your campus.' }, skills: ['React', 'Node.js', 'MongoDB'], prerequisites: ['s5-react', 's5-node-backend', 's5-mongodb-rest'] },
        frontend: { title: 'Frontend project', project: { title: 'A polished React + TypeScript app', description: 'An app that uses a public API, is responsive and keyboard accessible, and is deployed online.' }, skills: ['React', 'TypeScript', 'Accessibility'], prerequisites: ['s5-react', 's5-typescript'] },
        backend: { title: 'Backend project', project: { title: 'A secure REST API', description: 'Authentication, roles, validation, pagination and documentation, for example a hostel complaint tracker.' }, skills: ['Node.js', 'MongoDB', 'Authentication'], prerequisites: ['s5-node-backend', 's5-mongodb-rest', 's5-auth-security'] },
        'ai-ml': { title: 'Machine learning project', project: { title: 'Compare models on a real problem', description: 'Train, evaluate and compare models on a real dataset, then publish the notebook and a short write-up of what worked and what didn’t.' }, skills: ['Deep Learning', 'Machine Learning'], prerequisites: ['s5-deep-learning', 's5-ml-experiments'] },
        'data-analyst': { title: 'Analytics project', project: { title: 'An end-to-end analysis', description: 'Clean a public dataset, query it with SQL and publish a dashboard with three clear insights.' }, skills: ['SQL', 'Power BI', 'Data Storytelling'], prerequisites: ['s5-advanced-sql', 's5-dashboards'] },
        cybersecurity: { title: 'Security lab project', project: { title: 'A home security lab', description: 'Set up virtual machines, attack and defend only your own systems, and document how you detected and fixed a weakness.' }, skills: ['Network Security', 'Linux'], prerequisites: ['s5-network-security'] },
        mobile: { title: 'Mobile app project', project: { title: 'A complete app', description: 'Sign-in, data from an API, offline support and a release build you can share with friends.' }, skills: ['Mobile Architecture', 'Authentication'], prerequisites: ['s5-mobile-architecture', 's5-mobile-backend'] },
      },
    },
  },

  // ------------------------------------------------------------------------- Semester 6
  {
    id: 's6-advanced-project',
    semester: 6,
    title: 'Advanced project development',
    summary: 'Take your best project further: real users, real feedback, better code. A team project counts too.',
    category: 'build',
    difficulty: 'advanced',
    effortHours: 60,
    objectives: ['Get feedback from at least five real users', 'Improve performance and code quality', 'Work with teammates through pull requests', 'Write documentation others can follow'],
    skills: ['Teamwork'],
    resources: [C.addProject, C.communities],
    prerequisites: ['s5-capstone-project'],
  },
  {
    id: 's6-testing-deployment',
    semester: 6,
    goals: ['full-stack', 'frontend', 'backend', 'mobile'],
    title: 'Testing and deployment fundamentals',
    summary: 'Ship with confidence: automated tests, continuous integration and a real deployment.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Write unit and integration tests', 'Run tests on every push with CI', 'Keep secrets out of your code', 'Deploy your app and roll back if needed'],
    skills: ['Testing', 'CI/CD', 'Docker'],
    resources: [R.vitest, R.githubActions, R.docker],
    variants: {
      goals: {
        mobile: { summary: 'Ship with confidence: automated tests, continuous integration and a release build.', skills: ['Testing', 'CI/CD'], resources: [R.githubActions, R.flutterAndroidRelease] },
      },
    },
  },
  {
    id: 's6-system-design-basics',
    semester: 6,
    goals: ['backend'],
    title: 'System design basics',
    summary: 'How real systems handle more users: caching, queues and scaling.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Explain caching and when to invalidate it', 'Use queues for background work', 'Discuss scaling trade-offs in an interview'],
    skills: ['System Design'],
    resources: [R.systemDesignPrimer],
    prerequisites: ['s5-node-backend'],
  },
  {
    id: 's6-model-deployment',
    semester: 6,
    goals: ['ai-ml'],
    title: 'Model deployment and MLOps basics',
    summary: 'A model only helps once people can use it. Serve it, version it and watch it.',
    category: 'learn',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Serve a model behind an API', 'Version data and models', 'Monitor predictions for drift'],
    skills: ['MLOps', 'FastAPI'],
    resources: [R.fastapi, R.mlflow],
    prerequisites: ['s5-ml-experiments'],
  },
  {
    id: 's6-analytics-case-studies',
    semester: 6,
    goals: ['data-analyst'],
    title: 'Business case studies',
    summary: 'Practise the way analysts think: from a vague question to a clear recommendation.',
    category: 'practice',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Frame a business question as metrics', 'Analyse an A/B test result', 'Complete three written case studies'],
    skills: ['Business Analysis', 'A/B Testing'],
    prerequisites: ['s5-advanced-sql'],
  },
  {
    id: 's6-ctf-practice',
    semester: 6,
    goals: ['cybersecurity'],
    title: 'Capture the flag practice',
    summary: 'Legal, beginner-friendly security challenges that build real skills.',
    category: 'practice',
    difficulty: 'advanced',
    effortHours: 30,
    objectives: ['Solve challenges across web, crypto and forensics', 'Write up your solutions', 'Take part in a campus or online CTF with a team'],
    skills: ['CTF', 'Problem Solving'],
    resources: [R.picoCtf, R.bandit],
    prerequisites: ['s4-web-security-lab'],
  },
  {
    id: 's6-internship-prep',
    semester: 6,
    title: 'Internship preparation',
    summary: 'Get ready to apply: a focused resume, practised project stories and a shortlist of roles.',
    category: 'career',
    difficulty: 'intermediate',
    effortHours: 15,
    objectives: ['Shortlist roles and organisations that fit your goal', 'Write a one-page resume', 'Practise explaining two projects in two minutes each', 'Apply to your first internships'],
    skills: ['Communication'],
    resources: [C.opportunities, R.resumeGuide],
  },
  {
    id: 's6-github-portfolio',
    semester: 6,
    title: 'GitHub portfolio improvement',
    summary: 'Make your best work easy to find and easy to understand.',
    category: 'career',
    difficulty: 'beginner',
    effortHours: 10,
    objectives: ['Pin your best repositories', 'Add READMEs with screenshots and setup steps', 'Create a profile README', 'Link your portfolio on your CampusX profile'],
    skills: ['GitHub'],
    resources: [R.githubProfileReadme, R.githubPages, C.editProfile],
    prerequisites: ['s1-git-github'],
  },

  // ------------------------------------------------------------------------- Semester 7
  {
    id: 's7-interview-dsa',
    semester: 7,
    title: 'Interview-focused DSA',
    summary: 'Revise the common problem patterns and practise explaining your thinking out loud.',
    category: 'practice',
    difficulty: 'advanced',
    effortHours: 40,
    objectives: ['Revise two pointers, sliding window, BFS/DFS and DP patterns', 'Practise timed problems', 'Explain your approach and its complexity aloud'],
    skills: ['DSA'],
    resources: [R.interviewHandbook, R.cpAlgorithms],
    prerequisites: ['s4-dsa-practice'],
    optionalFor: { goals: ['data-analyst', 'cybersecurity'] },
  },
  {
    id: 's7-aptitude-technical',
    semester: 7,
    title: 'Aptitude and technical interview preparation',
    summary: 'Prepare for placement tests and the technical questions for your role.',
    category: 'practice',
    difficulty: 'intermediate',
    effortHours: 25,
    objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OOP, DBMS, OS and networks', 'Prepare the core topics for your role'],
    skills: ['Aptitude'],
    resources: [R.interviewHandbook],
    variants: {
      goals: {
        'full-stack': { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OOP, DBMS, OS and networks', 'Prepare JavaScript, React, Node.js and database design questions'] },
        frontend: { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OOP, DBMS, OS and networks', 'Prepare JavaScript, browser, CSS and accessibility questions'] },
        backend: { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OOP, DBMS, OS and networks', 'Prepare API design, databases and system design questions'] },
        'ai-ml': { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OOP, DBMS, OS and networks', 'Prepare ML theory, statistics and model evaluation questions'] },
        'data-analyst': { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise DBMS and statistics', 'Prepare SQL, case and metrics questions'] },
        cybersecurity: { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OS and networks', 'Prepare web security, networking and incident response questions'] },
        mobile: { objectives: ['Practise quantitative aptitude and logical reasoning', 'Revise OOP, DBMS, OS and networks', 'Prepare app lifecycle, architecture and performance questions'] },
      },
    },
  },
  {
    id: 's7-resume-portfolio-review',
    semester: 7,
    title: 'Resume and portfolio review',
    summary: 'A second pair of eyes catches what you miss. Get feedback and polish.',
    category: 'career',
    difficulty: 'intermediate',
    effortHours: 8,
    objectives: ['Get your resume reviewed by a senior, mentor or placement cell', 'Describe impact with numbers where you can', 'Check every portfolio link works', 'Keep your CampusX profile up to date'],
    skills: ['Communication'],
    resources: [R.resumeGuide, C.communities, C.editProfile],
    prerequisites: ['s6-internship-prep'],
  },
  {
    id: 's7-applications',
    semester: 7,
    title: 'Internship and placement applications',
    summary: 'Apply steadily, keep track of every application and learn from each round.',
    category: 'career',
    difficulty: 'intermediate',
    effortHours: 20,
    objectives: ['Keep a list of applications and deadlines', 'Tailor your resume to each role', 'Follow up and note what each round asked'],
    skills: ['Communication'],
    resources: [C.opportunities, C.myOpportunities],
    prerequisites: ['s7-resume-portfolio-review'],
  },

  // ------------------------------------------------------------------------- Semester 8
  {
    id: 's8-placement-practice',
    semester: 8,
    title: 'Placement and interview practice',
    summary: 'Mock interviews make the real ones feel familiar.',
    category: 'practice',
    difficulty: 'advanced',
    effortHours: 25,
    objectives: ['Do mock technical and HR interviews with friends or seniors', 'Prepare stories for behavioural questions', 'Understand an offer letter before you accept'],
    skills: ['Interviewing'],
    resources: [R.behavioralGuide, R.interviewHandbook, C.communities],
  },
  {
    id: 's8-final-year-project',
    semester: 8,
    title: 'Final-year project completion',
    summary: 'Finish, test and document your final-year project so it represents your best work.',
    category: 'build',
    difficulty: 'advanced',
    effortHours: 80,
    objectives: ['Complete the features you planned', 'Test it and fix the important bugs', 'Write a clear report and README'],
    skills: ['Teamwork'],
    resources: [C.addProject],
  },
  {
    id: 's8-project-presentation',
    semester: 8,
    title: 'Project presentation',
    summary: 'Show your work clearly: a short demo, simple slides and confident answers.',
    category: 'career',
    difficulty: 'intermediate',
    effortHours: 10,
    objectives: ['Record a two-minute demo video', 'Prepare a five-minute presentation', 'Practise answering questions about your decisions'],
    skills: ['Communication'],
    resources: [C.addProject, C.addAchievement],
    prerequisites: ['s8-final-year-project'],
  },
  {
    id: 's8-career-transition',
    semester: 8,
    title: 'Career transition preparation',
    summary: 'Plan the move from campus to your first role, and help the juniors coming after you.',
    category: 'career',
    difficulty: 'beginner',
    effortHours: 10,
    objectives: ['Compare offers or next steps calmly', 'Plan your first 90 days of learning', 'Share what you learned with juniors on CampusX'],
    skills: ['Communication'],
    resources: [C.communities],
  },
]);

// ----------------------------------------------------------------------------- self-check

/**
 * Checked once at start-up, so a mistake in this file stops the server instead of reaching students:
 * ids, semesters, categories, links (https only, no credentials), CampusX paths and prerequisites.
 * services/roadmapService.js adds that every goal on every track has required milestones in every semester.
 */
export function assertRoadmapCatalog(milestones = MILESTONES) {
  const fail = (message) => {
    throw new Error(`Roadmap catalog: ${message}`);
  };
  const categories = new Set(MILESTONE_CATEGORIES.map((item) => item.id));
  const difficulties = new Set(DIFFICULTIES.map((item) => item.id));
  const goals = new Set(CAREER_GOAL_IDS);
  const tracks = new Set(BRANCH_TRACK_IDS);
  const ids = new Map();
  const checkResource = (resource, id) => {
    if (resource.kind === 'campusx') {
      if (!CAMPUSX_PATHS.includes(resource.path)) fail(`${id}: unknown CampusX path ${resource.path}`);
      return;
    }
    let url;
    try {
      url = new URL(resource.url);
    } catch {
      fail(`${id}: invalid link ${resource.url}`);
    }
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) fail(`${id}: unsafe link ${resource.url}`);
  };
  for (const milestone of milestones) {
    const { id } = milestone;
    if (!MILESTONE_ID_PATTERN.test(id ?? '')) fail(`bad id ${id}`);
    if (ids.has(id)) fail(`duplicate id ${id}`);
    ids.set(id, milestone);
    if (!Number.isInteger(milestone.semester) || milestone.semester < 1 || milestone.semester > ROADMAP_SEMESTERS) fail(`${id}: bad semester`);
    if (!categories.has(milestone.category)) fail(`${id}: bad category`);
    if (!difficulties.has(milestone.difficulty)) fail(`${id}: bad difficulty`);
    if (!(milestone.effortHours > 0)) fail(`${id}: effortHours must be positive`);
    for (const goal of [...(milestone.goals ?? []), ...(milestone.optionalFor?.goals ?? []), ...(milestone.requiredFor?.goals ?? []), ...Object.keys(milestone.variants?.goals ?? {})]) {
      if (!goals.has(goal)) fail(`${id}: unknown goal ${goal}`);
    }
    for (const track of [...(milestone.tracks ?? []), ...(milestone.optionalFor?.tracks ?? [])]) {
      if (!tracks.has(track)) fail(`${id}: unknown track ${track}`);
    }
    for (const resource of [...(milestone.resources ?? []), ...Object.values(milestone.variants?.goals ?? {}).flatMap((variant) => variant.resources ?? [])]) checkResource(resource, id);
  }
  for (const milestone of milestones) {
    for (const prerequisite of [...(milestone.prerequisites ?? []), ...Object.values(milestone.variants?.goals ?? {}).flatMap((variant) => variant.prerequisites ?? [])]) {
      const target = ids.get(prerequisite);
      if (!target) fail(`${milestone.id}: unknown prerequisite ${prerequisite}`);
      if (target.semester > milestone.semester) fail(`${milestone.id}: prerequisite ${prerequisite} is in a later semester`);
    }
  }
  return true;
}

assertRoadmapCatalog();

/** Every branch id belongs to exactly one track (checked here so a new branch can't be forgotten). */
for (const branch of BRANCHES) {
  if (BRANCH_TRACKS.filter((track) => track.branches.includes(branch.id)).length !== 1) throw new Error(`Roadmap catalog: branch ${branch.id} needs exactly one track`);
}
