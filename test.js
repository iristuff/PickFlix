const BASE = 'http://localhost:3000';

let sessionCode = '';
let passed = 0;
let failed = 0;

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  return { status: res.status, data };
}

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\nPickFlix Basic Function Tests');
  console.log('='.repeat(50));

  console.log('\n[Session Tests]');
  const create = await req('POST', '/api/sessions/create', { username: 'testhost' });
  sessionCode = create.data?.session?.code || '';
  assert('Create session', create.status === 201 && sessionCode.length === 6);

  const join = await req('POST', '/api/sessions/join',
    { code: sessionCode, username: 'testuser' });
  assert('Join session', join.status === 200 &&
    join.data?.session?.participants?.includes('testuser'));

  const bad = await req('POST', '/api/sessions/join',
    { code: 'XXXXXX', username: 'anyone' });
  assert('Reject invalid session code', bad.status === 404);

  const dup = await req('POST', '/api/sessions/join',
    { code: sessionCode, username: 'testhost' });
  assert('Reject duplicate username', dup.status === 400);

  console.log('\n[Movie Tests]');
  const search = await req('POST', '/api/movies/search', { query: 'Inception' });
  assert('Search movies via TMDB', search.status === 200 &&
    Array.isArray(search.data?.movies) && search.data.movies.length > 0);

  const add = await req('POST', '/api/movies/add', {
    sessionCode,
    username: 'testhost',
    movie: { tmdbId: '27205', title: 'Inception', year: '2010', rating: 8.8, overview: 'Test' }
  });
  assert('Add movie to pool', add.status === 201 && add.data?.movies?.length > 0);

  const dupMovie = await req('POST', '/api/movies/add', {
    sessionCode,
    username: 'testhost',
    movie: { tmdbId: '27205', title: 'Inception', year: '2010', rating: 8.8, overview: 'Test' }
  });
  assert('Reject duplicate movie', dupMovie.status === 400);

  console.log('\n[Voting Tests]');
  const nonHostStart = await req('PUT', `/api/sessions/${sessionCode}/status`,
    { username: 'testuser', status: 'voting' });
  assert('Reject non-host starting vote', nonHostStart.status === 403);

  const start = await req('PUT', `/api/sessions/${sessionCode}/status`,
    { username: 'testhost', status: 'voting' });
  assert('Start voting host only', start.status === 200 &&
    start.data?.session?.status === 'voting');

  const vote1 = await req('POST', '/api/votes/submit', {
    sessionCode,
    username: 'testhost',
    rankings: [{ movieId: '27205', title: 'Inception', rank: 1 }]
  });
  assert('Submit vote', vote1.status === 201);

  const dupVote = await req('POST', '/api/votes/submit', {
    sessionCode,
    username: 'testhost',
    rankings: [{ movieId: '27205', title: 'Inception', rank: 1 }]
  });
  assert('Reject duplicate vote', dupVote.status === 400);

  const vote2 = await req('POST', '/api/votes/submit', {
    sessionCode,
    username: 'testuser',
    rankings: [{ movieId: '27205', title: 'Inception', rank: 1 }]
  });
  assert('Submit second vote', vote2.status === 201);

  const session = await req('GET', `/api/sessions/${sessionCode}`);
  assert('Auto-complete session when all voted',
    session.data?.session?.status === 'completed');

  const results = await req('GET', `/api/votes/${sessionCode}/results`);
  assert('Get results with correct winner',
    results.status === 200 && results.data?.winner?.title === 'Inception');

  console.log('\n' + '─'.repeat(40));
  console.log(`  ${passed} passed | ${failed} failed`);
  console.log('─'.repeat(40) + '\n');
}

runTests().catch(console.error);