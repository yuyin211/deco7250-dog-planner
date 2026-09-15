// Only the saved dog profile survives reload. Outing choices and manual edits do not.
function readSavedDogProfile() {
  try {
    const value = JSON.parse(localStorage.getItem('savedDogProfile') || 'null');
    return value && typeof value.name === 'string' && Array.isArray(value.preferences) ? value : null;
  } catch { return null; }
}
const savedDogProfile = readSavedDogProfile();
const DEFAULT_PREFERENCES = ['Prefers quieter areas'];
const state = {
  screen:'plan', editor:null, savedDogProfile,
  currentOutingDogPreferences:[...(savedDogProfile?.preferences || DEFAULT_PREFERENCES)],
  dogName:savedDogProfile?.name || 'Milo',
  selections:{
    companions:savedDogProfile?.name || 'Milo',
    activities:['Market','Riverside walk','Café or food'],
    time:90,
    preferences:[...(savedDogProfile?.preferences || DEFAULT_PREFERENCES)]
  },
  recommendedStops:[], selectedRouteVariant:'default_quiet',
  manualPlaceOverrides:{}, stopDurations:{}, manualDurations:{},
  systemRecommendedStops:[], manuallyAddedStops:[], manuallyRemovedStopIds:[],
  stopRoles:{}, planSignature:null
};
const editorData = {
  activities:{title:'What would you like to do?',help:'Select all that apply',
    options:['Market','Café or food','Shopping','Riverside walk','Rest or picnic'],multi:true},
  time:{title:'How much time do you have?',help:'Set your outing duration'},
  preferences:{title:'',help:'Select all that apply',
    options:['Prefers quieter areas','Prefers fewer dogs','Avoids crowded areas',
      'Needs easier access to water','No specific preference'],multi:true}
};
const planScreen=document.querySelector('#plan-screen');
const suggestedScreen=document.querySelector('#suggested-screen');
const planActions=document.querySelector('#plan-actions');
const suggestedActions=document.querySelector('#suggested-actions');
const editorScreen=document.querySelector('#editor-screen');
const editorActions=document.querySelector('#editor-actions');
const editorOptions=document.querySelector('#editor-options');
const toast=document.querySelector('#toast');
let pendingProfileSave=false;
function formatDuration(minutes) {
  if (minutes < 60) return minutes+' min';
  const hours=Math.floor(minutes/60), remainder=minutes%60;
  return hours+' hr'+(remainder ? ' '+remainder+' min' : '');
}
function refreshPlanningValues() {
  document.querySelector('#companions-value').textContent=state.dogName;
  document.querySelector('#activities-value').textContent=state.selections.activities.join(', ');
  document.querySelector('#time-value').textContent=formatDuration(state.selections.time);
  const p=state.selections.preferences;
  document.querySelector('#preferences-value').textContent=
    p[0]+(p.length>1 ? ' +'+(p.length-1) : '');
  if (typeof updateGenerateAvailability === 'function') updateGenerateAvailability();
}
function hideAuxiliaryScreens() {
  for (const selector of ['#editor-screen','#save-preferences-screen','#dog-name-screen','#completion-screen'])
    document.querySelector(selector).classList.add('is-hidden');
  editorActions.classList.add('is-hidden');
}
function showScreen(screen) {
  state.screen=screen;
  hideAuxiliaryScreens();
  const planning=screen==='plan';
  planScreen.classList.toggle('is-hidden',!planning);
  suggestedScreen.classList.toggle('is-hidden',planning);
  planActions.classList.toggle('is-hidden',!planning);
  suggestedActions.classList.toggle('is-hidden',planning);
  document.querySelectorAll('.screen-dots span').forEach((dot,index)=>
    dot.classList.toggle('active',(planning&&index===0)||(!planning&&index===1)));
}
function showStandalone(selector,screenName) {
  state.screen=screenName;
  [planScreen,suggestedScreen,planActions,suggestedActions,editorScreen,editorActions]
    .forEach(element=>element.classList.add('is-hidden'));
  for (const id of ['#save-preferences-screen','#dog-name-screen','#completion-screen'])
    document.querySelector(id).classList.add('is-hidden');
  document.querySelector(selector).classList.remove('is-hidden');
}
function openEditor(type) {
  if(type==='companions') {
    pendingProfileSave=false;
    document.querySelector('#dog-name-input').value=state.savedDogProfile?.name || '';
    showStandalone('#dog-name-screen','dog-name');
    document.querySelector('#dog-name-input').focus();
    return;
  }
  const data=editorData[type];
  state.editor=type;
  document.querySelector('#editor-title').textContent=
    type==='preferences' ? 'Anything to consider for '+state.dogName+'?' : data.title;
  document.querySelector('#editor-help').textContent=data.help;
  document.querySelector('#time-wheel').hidden=type!=='time';
  document.querySelector('#time-wheel-value').hidden=type!=='time';
  editorOptions.hidden=type==='time';
  if (type==='time') {
    const hours=document.querySelector('#duration-hours');
    const minutes=document.querySelector('#duration-minutes');
    hours.innerHTML=[0,1,2,3].map(n=>'<option value="'+n+'">'+n+'</option>').join('');
    minutes.innerHTML=Array.from({length:12},(_,i)=>i*5)
      .map(n=>'<option value="'+n+'">'+String(n).padStart(2,'0')+'</option>').join('');
    hours.value=Math.floor(state.selections.time/60);
    minutes.value=state.selections.time%60;
    updateTimeWheel();
  } else {
    editorOptions.innerHTML=data.options.map(option=>{
      const selected=state.selections[type].includes(option);
      return '<button class="editor-option'+(selected?' selected':'')+
        '" type="button" aria-pressed="'+selected+'" data-option="'+option+'"><span>'+
        option+'</span><span class="check" aria-hidden="true">✓</span></button>';
    }).join('');
  }
  [planScreen,suggestedScreen,planActions,suggestedActions].forEach(element=>element.classList.add('is-hidden'));
  editorScreen.classList.remove('is-hidden');
  editorActions.classList.remove('is-hidden');
  document.querySelector('#save-editor').textContent=
    type==='activities' ? 'Done ('+state.selections.activities.length+')' : 'Done';
  document.querySelector('#save-editor').disabled=false;
  state.screen='editor';
  editorOptions.querySelector('.selected')?.focus();
}
function updateTimeWheel() {
  const hours=Number(document.querySelector('#duration-hours').value);
  const minutes=Number(document.querySelector('#duration-minutes').value);
  const total=hours*60+minutes;
  document.querySelector('#time-wheel-value').textContent=
    total>=30 && total<=180 ? formatDuration(total) : 'Choose 30 min to 3 hr';
  document.querySelector('#save-editor').disabled=total<30 || total>180;
}
function closeEditor() { state.editor=null; showScreen('plan'); }
function saveEditor() {
  const type=state.editor;
  if (!type) return;
  if (type==='time') {
    const total=Number(document.querySelector('#duration-hours').value)*60+
      Number(document.querySelector('#duration-minutes').value);
    if(total<30 || total>180 || total%5) return;
    state.selections.time=total;
  } else {
    const chosen=[...editorOptions.querySelectorAll('.editor-option.selected')]
      .map(option=>option.dataset.option);
    if(!chosen.length) return;
    state.selections[type]=chosen;
    if(type==='preferences') state.currentOutingDogPreferences=[...chosen];
  }
  refreshPlanningValues();
  closeEditor();
  if(type==='preferences' &&
    JSON.stringify([...state.selections.preferences].sort()) !==
    JSON.stringify([...(state.savedDogProfile?.preferences || [])].sort())) {
    showStandalone('#save-preferences-screen','profile-prompt');
  }
}
function persistDogProfile(name,preferences) {
  state.savedDogProfile={name,preferences:[...preferences]};
  localStorage.setItem('savedDogProfile',JSON.stringify(state.savedDogProfile));
  state.dogName=name;
  state.selections.companions=name;
  refreshPlanningValues();
}
function showToast(message) {
  toast.textContent=message;
  toast.classList.remove('is-hidden');
  window.setTimeout(()=>toast.classList.add('is-hidden'),2200);
}
document.querySelectorAll('.planning-row').forEach(row=>
  row.addEventListener('click',()=>openEditor(row.dataset.editor)));
editorOptions.addEventListener('click',event=>{
  const option=event.target.closest('.editor-option');
  if(!option) return;
  const specific=option.dataset.option!=='No specific preference';
  if(state.editor==='preferences') {
    if(!specific) editorOptions.querySelectorAll('.editor-option').forEach(button=>
      button.classList.toggle('selected',button===option));
    else {
      editorOptions.querySelector('[data-option="No specific preference"]')?.classList.remove('selected');
      option.classList.toggle('selected');
    }
    if(!editorOptions.querySelector('.selected')) option.classList.add('selected');
  } else option.classList.toggle('selected');
  editorOptions.querySelectorAll('.editor-option').forEach(button=>
    button.setAttribute('aria-pressed',String(button.classList.contains('selected'))));
  if(state.editor==='activities') document.querySelector('#save-editor').textContent=
    'Done ('+editorOptions.querySelectorAll('.selected').length+')';
  if(state.editor==='activities') document.querySelector('#save-editor').disabled=
    !editorOptions.querySelector('.selected');
});
document.querySelector('#duration-hours').onchange=updateTimeWheel;
document.querySelector('#duration-minutes').onchange=updateTimeWheel;
document.querySelector('#editor-back').onclick=closeEditor;
document.querySelector('#save-editor').onclick=saveEditor;
document.querySelector('#skip-preferences').onclick=()=>showScreen('plan');
document.querySelector('#save-preferences').onclick=()=>{
  if(state.savedDogProfile?.name) {
    persistDogProfile(state.savedDogProfile.name,state.selections.preferences);
    showScreen('plan');
  } else {
    pendingProfileSave=true;
    document.querySelector('#dog-name-input').value='';
    showStandalone('#dog-name-screen','dog-name');
    document.querySelector('#dog-name-input').focus();
  }
};
document.querySelector('#save-dog-name').onclick=()=>{
  const name=document.querySelector('#dog-name-input').value.trim();
  if(!name) {document.querySelector('#dog-name-input').focus();return;}
  const preferencesToSave=pendingProfileSave ? state.selections.preferences :
    (state.savedDogProfile?.preferences || DEFAULT_PREFERENCES);
  persistDogProfile(name,preferencesToSave);
  pendingProfileSave=false;
  showScreen('plan');
};
document.querySelector('#generate-button').onclick=()=>{
  if (!planningIsSufficient()) return;
  if (generateRecommendation() !== false) showScreen('suggested');
};
document.querySelector('#adjust-button').onclick=()=>showScreen('plan');
document.querySelectorAll('.screen-dots span').forEach((dot,index)=>
  dot.addEventListener('click',()=>showScreen(index===0?'plan':'suggested')));
refreshPlanningValues();
function planningIsSufficient() {
  return !!(state.dogName && state.selections.activities.length &&
    state.selections.time >= 30 && state.selections.preferences.length);
}
function updateGenerateAvailability() {
  document.querySelector('#generate-button').disabled=!planningIsSufficient();
}
updateGenerateAvailability();
