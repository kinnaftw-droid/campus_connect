/* Gather's browser client. It deliberately uses only fields exposed by backend/app.py. */
const state = {
  config: readConfig(),
  events: [],
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const page = document.querySelector('#main-content');
const identityButton = document.querySelector('#identity-button');
const settingsModal = document.querySelector('#settings-modal');
const attendeesModal = document.querySelector('#attendees-modal');

function readConfig() {
  try {
    return JSON.parse(localStorage.getItem('gather-config')) || { userId: '', organizerId: '', apiBase: '' };
  } catch {
    return { userId: '', organizerId: '', apiBase: '' };
  }
}

function saveConfig(config) {
  state.config = config;
  localStorage.setItem('gather-config', JSON.stringify(config));
  updateIdentity();
}

function apiUrl(path) {
  const base = (state.config.apiBase || '').trim().replace(/\/$/, '');
  return `${base}${path}`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      ...options,
    });
  } catch {
    throw new Error('Could not reach the API. Start Flask or check the API base URL in account settings.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function initials(title = '') {
  return String(title).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'EV';
}

function shortId(id = '') { return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id; }
function validId(id) { return uuidPattern.test((id || '').trim()); }
function statusClass(status) {
  const cleaned = String(status || 'unknown').toLowerCase();
  if (cleaned.includes('open') || cleaned.includes('active')) return 'badge-open';
  if (cleaned.includes('full')) return 'badge-full';
  if (cleaned.includes('close') || cleaned.includes('inactive')) return 'badge-closed';
  return 'badge-unknown';
}

function updateIdentity() {
  const id = state.config.userId;
  document.querySelector('#identity-label').textContent = validId(id) ? `Account · ${shortId(id)}` : 'Configure account';
  document.querySelector('#avatar').textContent = validId(id) ? id.slice(0, 2).toUpperCase() : '?';
}

function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  document.querySelector('#toast-region').append(toast);
  window.setTimeout(() => toast.remove(), 5000);
}

function showLoading(label = 'Loading events…') {
  page.innerHTML = `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span></div>`;
}

function showError(error, retryHash = location.hash) {
  page.innerHTML = `<section class="error-state"><div><h2>Couldn’t load this page</h2><p>${escapeHtml(error.message || error)}</p><button class="button button-primary" id="retry-button">Try again</button></div></section>`;
  document.querySelector('#retry-button').addEventListener('click', () => renderRoute(retryHash));
}

function emptyState(title, copy, actionLabel, action) {
  return `<section class="empty-state"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p>${actionLabel ? `<button class="button button-primary" data-empty-action>${escapeHtml(actionLabel)}</button>` : ''}</div></section>`;
}

function bindEmptyAction(callback) {
  document.querySelector('[data-empty-action]')?.addEventListener('click', callback);
}

function setNav(route) {
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === route));
}

async function loadEvents(force = false) {
  if (!force && state.events.length) return state.events;
  const events = await request('/api/events');
  state.events = Array.isArray(events) ? events : [];
  return state.events;
}

function eventCard(event) {
  return `<article class="event-card">
    <div class="event-card-accent"></div>
    <div class="event-card-body">
      <div class="event-icon" aria-hidden="true">${escapeHtml(initials(event.title))}</div>
      <span class="badge ${statusClass(event.status)}">${escapeHtml(event.status || 'Unknown')}</span>
      <h2 class="event-title">${escapeHtml(event.title || 'Untitled event')}</h2>
      <div class="event-meta">
        <span><strong>Capacity</strong> ${event.capacity ?? 'Not limited'} seats</span>
        <span class="mono short-id" title="${escapeHtml(event.organizer_id || '')}">Organizer · ${escapeHtml(shortId(event.organizer_id || 'Unknown'))}</span>
      </div>
      <div class="event-footer"><span class="mono short-id" title="${escapeHtml(event.id)}">${escapeHtml(shortId(event.id))}</span><a class="button button-secondary button-small" href="#event/${encodeURIComponent(event.id)}">View event</a></div>
    </div>
  </article>`;
}

async function renderEvents() {
  setNav('events');
  showLoading();
  try {
    const events = await loadEvents(true);
    page.innerHTML = `<section class="page-intro"><div><p class="eyebrow">Discover</p><h1>Find your next gathering</h1><p class="lede">Browse events and reserve a place in one click. Event details shown here come directly from the Gather API.</p></div><button class="button button-secondary" id="refresh-events">↻ Refresh</button></section>${events.length ? `<section class="events-grid" aria-label="Available events">${events.map(eventCard).join('')}</section>` : emptyState('No events yet', 'The API did not return any events. Add an event in Supabase, then refresh this page.', 'Refresh events')}`;
    document.querySelector('#refresh-events')?.addEventListener('click', () => renderEvents());
    bindEmptyAction(renderEvents);
  } catch (error) { showError(error, '#events'); }
}

async function renderEvent(eventId) {
  setNav('events');
  showLoading('Loading event…');
  try {
    const event = await request(`/api/events/${encodeURIComponent(eventId)}`);
    page.innerHTML = `<a href="#events" class="back-link">← All events</a>
      <section class="detail-grid">
        <article class="ticket">
          <div class="ticket-main"><div><span class="badge ${statusClass(event.status)}">${escapeHtml(event.status || 'Unknown')}</span><h1 class="ticket-title">${escapeHtml(event.title || 'Untitled event')}</h1></div>
            <dl class="ticket-data"><div><dt>Organizer ID</dt><dd class="mono">${escapeHtml(event.organizer_id || 'Not provided')}</dd></div><div><dt>Event ID</dt><dd class="mono">${escapeHtml(event.id)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(event.status || 'Unknown')}</dd></div></dl>
          </div><aside class="ticket-stub"><span class="ticket-stub-number">${event.capacity ?? '∞'}</span><span class="ticket-stub-label">${event.capacity == null ? 'open capacity' : 'seats total'}</span></aside>
        </article>
        <aside class="register-panel"><div><h2>Save your seat</h2><p>${validId(state.config.userId) ? `Register as <span class="mono">${escapeHtml(shortId(state.config.userId))}</span>.` : 'Connect your account UUID first, then reserve your place.'}</p></div><div><button class="button button-blue" id="register-button" ${validId(state.config.userId) ? '' : 'disabled'}>${validId(state.config.userId) ? 'Register for this event' : 'Configure account to register'}</button><p class="help-text">Your ticket will appear in <a href="#registrations">My registrations</a>.</p></div></aside>
      </section><p class="notice"><span aria-hidden="true">ⓘ</span><span>Registration availability is determined by the API. It will report if this event is already full or you have already registered.</span></p>`;
    document.querySelector('#register-button')?.addEventListener('click', () => registerForEvent(event));
  } catch (error) { showError(error, `#event/${eventId}`); }
}

async function registerForEvent(event) {
  if (!validId(state.config.userId)) { openSettings(); return; }
  const button = document.querySelector('#register-button');
  button.disabled = true;
  button.textContent = 'Registering…';
  try {
    await request('/api/registrations', { method: 'POST', body: JSON.stringify({ user_id: state.config.userId.trim(), event_id: event.id }) });
    button.textContent = '✓ You’re registered';
    button.classList.remove('button-blue');
    button.classList.add('button-primary');
    showToast('You’re registered', 'Your ticket is now listed under My registrations.', 'success');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Register for this event';
    const isDuplicate = /already registered/i.test(error.message);
    const isFull = /full/i.test(error.message);
    showToast(isDuplicate ? 'Already registered' : isFull ? 'Event is full' : 'Registration failed', error.message, isDuplicate || isFull ? 'info' : 'error');
  }
}

async function renderRegistrations() {
  setNav('registrations');
  if (!validId(state.config.userId)) {
    page.innerHTML = `<section class="page-intro"><div><p class="eyebrow">Your tickets</p><h1>My registrations</h1><p class="lede">See every event you have reserved.</p></div></section>${emptyState('Connect your account', 'Enter your user UUID to load registrations from the API.', 'Configure account')}`;
    bindEmptyAction(openSettings);
    return;
  }
  showLoading('Loading your registrations…');
  try {
    const registrations = await request(`/api/me/registrations?user_id=${encodeURIComponent(state.config.userId.trim())}`);
    page.innerHTML = `<section class="page-intro"><div><p class="eyebrow">Your tickets</p><h1>My registrations</h1><p class="lede">Every ticket below is linked to your configured Gather account.</p></div><button class="button button-secondary" id="refresh-registrations">↻ Refresh</button></section>${registrations.length ? `<section class="registration-list" aria-label="Your event registrations">${registrations.map(registrationCard).join('')}</section>` : emptyState('No registrations yet', 'When you reserve a place at an event, its ticket will appear here.', 'Browse events')}`;
    document.querySelector('#refresh-registrations')?.addEventListener('click', renderRegistrations);
    bindEmptyAction(() => { location.hash = '#events'; });
  } catch (error) { showError(error, '#registrations'); }
}

function registrationCard(registration) {
  const event = registration.event || {};
  const created = formatDate(registration.created_at);
  return `<article class="registration-item"><i aria-hidden="true"></i><div class="registration-content"><span class="badge ${statusClass(event.status)}">${escapeHtml(event.status || 'Event status unavailable')}</span><h2>${escapeHtml(event.title || 'Event no longer available')}</h2><p>${event.capacity ?? 'No'} ${event.capacity === 1 ? 'seat' : 'seats'} total · <span class="mono">${escapeHtml(shortId(event.id || registration.event_id || ''))}</span></p></div><div class="registration-date"><span>Registered</span><strong>${escapeHtml(created)}</strong></div><a class="button button-secondary button-small" style="display:none" href="#event/${encodeURIComponent(event.id || registration.event_id)}">View</a></article>`;
}

async function renderOrganizer() {
  setNav('organizer');
  const organizerId = state.config.organizerId || state.config.userId;
  if (!validId(organizerId)) {
    page.innerHTML = `<section class="page-intro"><div><p class="eyebrow">Host tools</p><h1>Organizer dashboard</h1><p class="lede">Monitor the events you host and inspect registered attendees.</p></div></section>${emptyState('Connect your organizer account', 'Enter the organizer UUID that owns your events to load the dashboard.', 'Configure account')}`;
    bindEmptyAction(openSettings);
    return;
  }
  showLoading('Loading your hosted events…');
  try {
    const events = await loadEvents(true);
    const mine = events.filter(event => event.organizer_id === organizerId.trim());
    const enriched = await Promise.all(mine.map(async event => {
      try {
        const registrations = await request(`/api/events/${encodeURIComponent(event.id)}/registrations?organizer_id=${encodeURIComponent(organizerId.trim())}`);
        return { ...event, attendeeCount: registrations.length };
      } catch { return { ...event, attendeeCount: null }; }
    }));
    const totalAttendees = enriched.reduce((total, event) => total + (event.attendeeCount || 0), 0);
    const totalCapacity = enriched.reduce((total, event) => total + (Number(event.capacity) || 0), 0);
    const fillRate = totalCapacity ? Math.round((totalAttendees / totalCapacity) * 100) : 0;
    page.innerHTML = `<section class="page-intro"><div><p class="eyebrow">Host tools</p><h1>Organizer dashboard</h1><p class="lede">Manage your hosted events and inspect the attendee data the API authorizes for you.</p></div><button class="button button-secondary" id="refresh-organizer">↻ Refresh</button></section>
      <section class="metrics" aria-label="Organizer metrics"><div class="metric"><span class="metric-label">Hosted events</span><strong class="metric-value">${enriched.length}</strong></div><div class="metric"><span class="metric-label">Registered attendees</span><strong class="metric-value">${totalAttendees}</strong></div><div class="metric"><span class="metric-label">Capacity filled</span><strong class="metric-value">${totalCapacity ? `${fillRate}%` : '—'}</strong></div></section>
      <section><div class="section-heading"><h2>Your hosted events</h2><span>${escapeHtml(shortId(organizerId.trim()))}</span></div>${enriched.length ? `<div class="organizer-list">${enriched.map(organizerEventCard).join('')}</div>` : emptyState('No hosted events found', 'No events in the API are owned by this organizer UUID.', '', '')}</section>`;
    document.querySelector('#refresh-organizer')?.addEventListener('click', renderOrganizer);
    document.querySelectorAll('[data-attendees]').forEach(button => button.addEventListener('click', () => openAttendees(button.dataset.attendees)));
  } catch (error) { showError(error, '#organizer'); }
}

function organizerEventCard(event) {
  const count = event.attendeeCount;
  const capacity = Number(event.capacity);
  const percent = capacity && count !== null ? Math.min(100, Math.round((count / capacity) * 100)) : 0;
  const countText = count === null ? 'Attendee count unavailable' : capacity ? `${count} / ${capacity} registered` : `${count} registered`;
  return `<article class="organizer-event"><i aria-hidden="true"></i><div class="organizer-event-content"><span class="badge ${statusClass(event.status)}">${escapeHtml(event.status || 'Unknown')}</span><h3>${escapeHtml(event.title || 'Untitled event')}</h3><p class="mono">${escapeHtml(event.id)}</p><div class="capacity-row"><div class="capacity-track" aria-hidden="true"><div class="capacity-fill" style="width:${percent}%"></div></div><span class="capacity-copy">${escapeHtml(countText)}</span></div></div><div class="organizer-actions"><button class="button button-secondary button-small" data-attendees="${escapeHtml(event.id)}">View attendees</button><a class="button button-primary button-small" href="#event/${encodeURIComponent(event.id)}">Event</a></div></article>`;
}

async function openAttendees(eventId) {
  const organizerId = (state.config.organizerId || state.config.userId).trim();
  const event = state.events.find(item => item.id === eventId);
  document.querySelector('#attendees-title').textContent = event ? `${event.title} attendees` : 'Attendees';
  document.querySelector('#attendees-content').innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>Loading attendees…</span></div>';
  attendeesModal.showModal();
  try {
    const attendees = await request(`/api/events/${encodeURIComponent(eventId)}/registrations?organizer_id=${encodeURIComponent(organizerId)}`);
    document.querySelector('#attendees-content').innerHTML = attendees.length ? `<div class="attendee-table-wrap"><table class="attendee-table"><thead><tr><th>Email</th><th>Role</th><th>Registered</th><th>User ID</th></tr></thead><tbody>${attendees.map(attendee => `<tr><td>${escapeHtml(attendee.user?.email || 'Not supplied')}</td><td>${escapeHtml(attendee.user?.role || '—')}</td><td>${escapeHtml(formatDate(attendee.created_at))}</td><td class="mono">${escapeHtml(shortId(attendee.user_id || ''))}</td></tr>`).join('')}</tbody></table></div>` : emptyState('No attendees yet', 'No one has registered for this event.', '', '');
  } catch (error) {
    document.querySelector('#attendees-content').innerHTML = `<section class="error-state"><div><h2>Couldn’t load attendees</h2><p>${escapeHtml(error.message)}</p></div></section>`;
  }
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function openSettings() {
  document.querySelector('#user-id').value = state.config.userId || '';
  document.querySelector('#organizer-id').value = state.config.organizerId || '';
  document.querySelector('#api-base').value = state.config.apiBase || '';
  settingsModal.showModal();
  window.setTimeout(() => document.querySelector('#user-id').focus(), 0);
}

function currentRoute() {
  const raw = location.hash.replace(/^#/, '') || 'events';
  const [route, eventId] = raw.split('/');
  return { route, eventId };
}

async function renderRoute(hash = location.hash) {
  if (hash !== location.hash) location.hash = hash;
  const { route, eventId } = currentRoute();
  if (route === 'event' && eventId) return renderEvent(eventId);
  if (route === 'registrations') return renderRegistrations();
  if (route === 'organizer') return renderOrganizer();
  return renderEvents();
}

identityButton.addEventListener('click', openSettings);
document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeModal}`).close()));
document.querySelector('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const config = { userId: String(form.get('userId') || '').trim(), organizerId: String(form.get('organizerId') || '').trim(), apiBase: String(form.get('apiBase') || '').trim() };
  if (config.userId && !validId(config.userId)) { showToast('Check your user ID', 'The user ID must be a valid UUID.', 'error'); return; }
  if (config.organizerId && !validId(config.organizerId)) { showToast('Check your organizer ID', 'The organizer ID must be a valid UUID.', 'error'); return; }
  saveConfig(config);
  settingsModal.close();
  showToast('Account saved', 'Your account settings are stored in this browser.', 'success');
  renderRoute();
});
window.addEventListener('hashchange', () => renderRoute());
updateIdentity();
renderRoute();
