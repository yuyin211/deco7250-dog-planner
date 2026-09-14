const state = {
  screen: 'plan',
  editor: null,
  selections: {
    companions: 'Milo',
    activities: ['Market', 'Riverside walk', 'Café or food'],
    time: '90 min',
    preferences: ['Prefers quieter areas']
  },
  recommendedStops: [],
  selectedRouteVariant: 'default_quiet',
  manualPlaceOverrides: {},
  stopDurations: {},
  manualDurations: {},
  stopRoles: {},
  planSignature: null
};
const editorData = {
  companions:{ title:'Going with', help:'Your saved dog for this outing', options:['Milo · Saved dog','Use different preferences for this outing'] },
  activities:{ title:'Activities', help:'Choose one or more parts of the outing.', options:['Market','Riverside walk','Café or food','Park','Dog social time','Shopping'], multi:true },
  time:{ title:'Available time', help:'How long would you like to be out?', options:['45 min','60 min','90 min','2 hours'] },
  preferences:{ title:'Dog preferences', help:'Choose one or more preferences for Milo.', options:['Prefers quieter areas','Enjoys meeting other dogs','Needs regular water stops','Shorter walks preferred'], multi:true }
};
const planScreen=document.querySelector('#plan-screen'); const suggestedScreen=document.querySelector('#suggested-screen'); const planActions=document.querySelector('#plan-actions'); const suggestedActions=document.querySelector('#suggested-actions'); const modalBackdrop=document.querySelector('#modal-backdrop'); const editorOptions=document.querySelector('#editor-options'); const editorTitle=document.querySelector('#editor-title'); const editorHelp=document.querySelector('#editor-help'); const toast=document.querySelector('#toast');
function showScreen(screen) { state.screen=screen; const planning=screen==='plan'; planScreen.classList.toggle('is-hidden',!planning); suggestedScreen.classList.toggle('is-hidden',planning); planActions.classList.toggle('is-hidden',!planning); suggestedActions.classList.toggle('is-hidden',planning); document.querySelectorAll('.screen-dots span').forEach((dot,index)=>dot.classList.toggle('active',(planning&&index===0)||(!planning&&index===1))); }
function openEditor(type) { const data=editorData[type]; state.editor=type; editorTitle.textContent=data.title; editorHelp.textContent=data.help; const selectedValues=data.multi?state.selections[type]:[state.selections[type]]; editorOptions.innerHTML=data.options.map(option=>{ const selected=selectedValues.includes(option)||(!data.multi&&type==='companions'&&option.startsWith('Milo')); return `<button class="editor-option${selected?' selected':''}" type="button" data-option="${option.replace(/"/g,'&quot;')}"><span>${option}</span><span class="check" aria-hidden="true">✓</span></button>`; }).join(''); modalBackdrop.classList.remove('is-hidden'); editorOptions.querySelector('.selected')?.focus(); }
function closeEditor() { state.editor=null; modalBackdrop.classList.add('is-hidden'); }
function saveEditor() { if(!state.editor)return; const type=state.editor; const selected=[...editorOptions.querySelectorAll('.editor-option.selected')].map(option=>option.dataset.option); if(!selected.length)return; state.selections[type]=editorData[type].multi?selected:selected[0]; if(type==='companions'&&state.selections[type].startsWith('Milo')) document.querySelector(`#${type}-value`).textContent='Milo'; else if(type==='activities') document.querySelector(`#${type}-value`).textContent=state.selections[type].join(', '); else if(type==='preferences') document.querySelector(`#${type}-value`).textContent=state.selections[type][0]+(state.selections[type].length>1?` +${state.selections[type].length-1}`:''); else document.querySelector(`#${type}-value`).textContent=state.selections[type]; closeEditor(); }
function showToast(message) { toast.textContent=message; toast.classList.remove('is-hidden'); window.setTimeout(()=>toast.classList.add('is-hidden'),2200); }
document.querySelectorAll('.planning-row').forEach(row=>row.addEventListener('click',()=>openEditor(row.dataset.editor)));
editorOptions.addEventListener('click',event=>{ const option=event.target.closest('.editor-option'); if(!option)return; if(editorData[state.editor].multi) option.classList.toggle('selected'); else { editorOptions.querySelectorAll('.editor-option').forEach(item=>item.classList.remove('selected')); option.classList.add('selected'); } });
document.querySelector('#close-editor').addEventListener('click',closeEditor); document.querySelector('#save-editor').addEventListener('click',saveEditor); modalBackdrop.addEventListener('click',event=>{if(event.target===modalBackdrop)closeEditor();});
document.querySelector('#generate-button').addEventListener('click',()=>{ generateRecommendation(); showScreen('suggested'); });
document.querySelector('#adjust-button').addEventListener('click',()=>showScreen('plan'));
document.querySelectorAll('.screen-dots span').forEach((dot,index)=>dot.addEventListener('click',()=>showScreen(index===0?'plan':'suggested')));
