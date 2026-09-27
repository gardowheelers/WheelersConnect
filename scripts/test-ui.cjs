// Component interaction tests with a mocked native bridge and isolated in-memory data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const oldLoad = Module._load;
const mocks = new Map();
Module._load = function (name, parent, ...rest) {
  if (mocks.has(name)) return mocks.get(name);
  return oldLoad.call(this, name, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const params = {};
const native = Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','Modal','KeyboardAvoidingView'].map(key => [key,key]));
mocks.set('react-native', { ...native, StyleSheet: { create: value => value }, Platform: { OS: 'web' },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } });
mocks.set('react-native-safe-area-context', { SafeAreaView: 'View' });
mocks.set('expo-router', { useLocalSearchParams: () => params, useFocusEffect: fn => React.useEffect(fn, [fn]), router: { navigate() {}, setParams(next) { Object.assign(params, next); } } });
mocks.set('../components/screen-back-button', { ScreenBackButton: () => null });
mocks.set('../auth/auth-provider', { useAuth: () => ({ owner: 'me', session: { user: { id: 'me' } }, dataEpoch: 0 }) });
const ride = { id: 'same-id', title: 'Local title', date: '01/01/2030', time: '10:00', departure: 'Meynes', type: 'Route', distance: '10', level: 'Tous niveaux', maxParticipants: '3', description: 'Balade' };
mocks.set('../data/local-store', { storageKey: () => 'rides', localStorage: { getItem: async () => JSON.stringify([ride]), setItem: async () => {} } });
mocks.set('../data/community-rides', { listCommunityRides: async () => [{ ...ride, title: 'Community title', organizerId: 'other', participantCount: 0, joined: false }], publishCommunityRide: async () => {}, joinCommunityRide: async () => {}, leaveCommunityRide: async () => {}, unpublishCommunityRide: async () => {} });
let sends = 0;
let rejectSend;
mocks.set('../data/community-messages', {
  listMembers: async () => [{ userId: 'other', displayName: 'Other member', username: 'other', location: 'Nîmes' }],
  listDirectMessages: async () => [],
  sendDirectMessage: () => { sends++; return new Promise((resolve, reject) => { rejectSend = reject; }); },
});
mocks.set('../data/admin', { readAdminDashboard: async () => { throw new Error('Accès réservé'); } });
const text = node => typeof node === 'string' ? node : node?.children?.map(text).join('') ?? '';
const button = (root, label) => root.findAllByType('Pressable').find(node => text(node) === label);
let checks = 0;
async function test(name, fn) { await fn(); console.log(`OK ${++checks}: ${name}`); }
async function mount(Component) { let renderer; await act(async () => { renderer = create(React.createElement(Component)); }); return renderer; }
async function unmount(renderer) { await act(async () => renderer.unmount()); }
(async () => {
  await test('search ignores accents and matches all words', async () => {
    const { matchesSearch } = require('../src/data/search.ts');
    assert(matchesSearch('nimes STEPHANE', ['Stéphane', 'Nîmes']));
    assert(!matchesSearch('Nîmes Paris', ['Stéphane', 'Nîmes']));
    assert(matchesSearch('', ['Meynes']));
  });
  await test('community detail uses correct source and hides owner controls', async () => {
    const renderer = await mount(require('../src/app/sorties.tsx').default);
    const card = renderer.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Voir la sortie Community title');
    await act(async () => card.props.onPress());
    const modal = renderer.root.findByType('Modal');
    assert.equal(modal.props.visible, true);
    assert(text(modal).includes('Community title'));
    assert(!button(modal, 'Modifier'));
    assert(!button(modal, 'Supprimer'));
    assert(button(modal, "J'y vais"));
    await unmount(renderer);
  });
  await test('personal detail retains editing and deletion controls', async () => {
    const renderer = await mount(require('../src/app/sorties.tsx').default);
    const card = renderer.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Voir la sortie Local title');
    await act(async () => card.props.onPress());
    const modal = renderer.root.findByType('Modal');
    assert(button(modal, 'Modifier'));
    assert(button(modal, 'Supprimer'));
    await unmount(renderer);
  });
  await test('double tap sends once and failure preserves the message', async () => {
    const renderer = await mount(require('../src/app/messages.tsx').default);
    const member = renderer.root.findAllByType('Pressable').find(node => text(node).includes('Écrire ›'));
    await act(async () => member.props.onPress());
    const input = renderer.root.findByType('TextInput');
    await act(async () => input.props.onChangeText('Bonjour'));
    const send = button(renderer.root, 'Envoyer');
    await act(async () => { send.props.onPress(); send.props.onPress(); });
    assert.equal(sends, 1);
    assert.equal(renderer.root.findByType('TextInput').props.editable, false);
    await act(async () => rejectSend(new Error('offline')));
    assert.equal(renderer.root.findByType('TextInput').props.value, 'Bonjour');
    assert(text(renderer.root.findByType('Modal')).includes('Envoi non confirmé'));
    await unmount(renderer);
  });
  await test('administrator error shows no invented counters', async () => {
    const renderer = await mount(require('../src/app/admin.tsx').default);
    assert(text(renderer.root).includes('Accès réservé'));
    assert(!text(renderer.root).includes('Dernière lecture'));
    await unmount(renderer);
  });
  console.log(`${checks} component tests passed. Native device still requires testing.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
