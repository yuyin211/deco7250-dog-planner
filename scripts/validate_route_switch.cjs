// Integration regression: real Leaflet layers, SVG paths and app handlers.
// Pass a jsdom module path and leaflet.js path; no browser or tile fetching.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require(process.argv[2]);
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('templates/index.html','utf8'),{runScripts:'outside-only',url:'http://localhost:5000',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
w.SVGSVGElement.prototype.createSVGRect=()=>({});
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>390});
Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get:()=>450});
w.eval(fs.readFileSync(process.argv[3],'utf8'));
w.eval(['static/data/places.js','static/data/route-paths.js','static/data/routes.js','static/js/app.js','static/js/recommendation.js','static/js/map.js','static/js/navigation.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\nwindow.testApp={state,PLACES,ROUTE_VARIANTS,ROUTE_PATHS,OUTING_ROUTES,outingMap,navigation,selectedRoute,generateRecommendation,activityCoverage,itineraryTiming,routeSummary,startNavigation,advanceNavigation,decideRoute,closeMap,additionCandidates,openPlaceDetails,editedSubsetRoute,routeFacilities,facilityPairEligible,facilityDistanceOnRoute,availableMinutes};');
const a=w.testApp,plain=v=>JSON.parse(JSON.stringify(v)),tick=()=>new Promise(r=>setTimeout(r,35));
const click=async s=>{assert.ok(d.querySelector(s),s);d.querySelector(s).click();await tick()};
const points=poly=>plain(poly.getLatLngs().map(p=>[p.lat,p.lng]));
const edge=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
function use(route){a.state.selectedRouteVariant=route.id;a.state.recommendedStops=[...route.placeIds];a.state.stopDurations={};a.state.stopRoles={};for(const id of route.placeIds){a.state.stopDurations[id]=20;a.state.stopRoles[id]=a.PLACES[id].activities[0];}}
async function run(){
  const routes=Object.values(a.ROUTE_VARIANTS).filter(r=>!r.hidden);
  use(a.ROUTE_VARIANTS.default_quiet);
  routes.push(a.editedSubsetRoute(['davies_market','cafe_quiet','orleigh_park']));
  for(const route of process.argv.includes('--manual-only') ? routes.filter(r=>r.manualEdit) : routes) {
    const b=a.ROUTE_VARIANTS[route.planB];assert.ok(b,route.id);
    assert.deepEqual(plain(route.placeIds),plain(b.placeIds));
    const i=route.navigationSteps[route.crowdTriggerStep],j=b.navigationSteps[route.planBSwitchStep];
    assert.deepEqual(plain(route.coordinates[i]),plain(b.coordinates[j]),route.id+' shared point');
    const blocked=new Set(route.coordinates.slice(route.busySegment[0],route.busySegment[1]+1).slice(1).map((p,k)=>edge(route.coordinates[route.busySegment[0]+k],p)));
    assert.ok(!b.coordinates.slice(j+1).some((p,k)=>blocked.has(edge(b.coordinates[j+k],p))),route.id+' avoids busy edge');
    for(const switching of [false,true]) {
      use(route);a.startNavigation();await tick();let alerts=0;
      while(!a.navigation.alert && !d.querySelector('#next-step').disabled) {a.advanceNavigation();await tick();}
      assert.equal(a.navigation.alert,true,route.id);alerts++;
      const m=a.outingMap,old=m.activePolyline,oldSvg=old.getElement().getAttribute('d');
      const position=plain(m.position.getLatLng());
      assert.equal(m.alternativeRouteLayer.getLayers().length,1);assert.equal(m.busySegmentLayer.getLayers().length,1);
      assert.deepEqual(points(m.activePolyline),plain(route.coordinates));
      await click(switching?'#switch-route':'#keep-route');
      const expected=switching?b:route;
      assert.equal(m.activeRouteId,expected.id);assert.equal(a.navigation.route,expected.id);
      assert.deepEqual(points(m.activePolyline),plain(expected.coordinates));
      assert.equal(m.activeRouteLayer.getLayers().length,2);assert.equal(m.alternativeRouteLayer.getLayers().length,0);
      assert.equal(m.busySegmentLayer.getLayers().length,switching?0:1);
      assert.equal(m.activePolyline.options.dashArray,null);assert.equal(m.map.hasLayer(old),false);
      assert.deepEqual(plain(m.position.getLatLng()),position,route.id+' no marker jump');
      assert.equal(d.querySelector('#review-summary').textContent,a.routeSummary(expected).join(' · '));
      if(switching) assert.notEqual(m.activePolyline.getElement().getAttribute('d'),oldSvg);
      while(!d.querySelector('#next-step').disabled){await click('#next-step');assert.equal(a.navigation.alert,false);const p=m.position.getLatLng();const target=expected.coordinates[expected.navigationSteps[a.navigation.step]];assert.deepEqual([p.lat,p.lng],plain(target));}
      assert.equal(d.querySelector('#completion-screen').classList.contains('is-hidden'),false);
      assert.equal(d.querySelector('#map-screen').classList.contains('is-hidden'),true);
      assert.match(d.querySelector('#completion-facts').textContent,/walked/);
      await click('#completion-done');
      assert.equal(a.state.screen,'plan');
    }
  }
  console.log('PASS actual Leaflet Switch/Keep, solid/dashed/busy layers, SVG change, shared marker, summary and completion:',process.argv.includes('--manual-only') ? 'derived manual route' : routes.length+' routes');
  for(const source of routes) {
    if(source.placeIds.length<3) continue;
    for(const removed of source.placeIds){
      use(source);const edited=a.editedSubsetRoute(source.placeIds.filter(id=>id!==removed));assert.ok(edited.planB,edited.id+' manual detour');
      const b=a.ROUTE_VARIANTS[edited.planB],i=edited.navigationSteps[edited.crowdTriggerStep],j=b.navigationSteps[edited.planBSwitchStep];
      assert.deepEqual(plain(edited.coordinates[i]),plain(b.coordinates[j]));
      const blocked=edge(edited.coordinates[edited.busySegment[0]],edited.coordinates[edited.busySegment[1]]);
      assert.ok(!b.coordinates.slice(j+1).some((p,k)=>edge(b.coordinates[j+k],p)===blocked),edited.id+' avoids busy return');
    }
  }
  console.log('PASS every supported single-stop removal retains a shared switch point and avoids its busy edge');
  a.state.selections.activities=['Shopping'];a.state.selections.time=60;a.state.planSignature=null;a.generateRecommendation();assert.ok(a.state.recommendedStops.some(id=>['west_village','boundary_precinct'].includes(id)));
  a.state.selections.activities=['Café or food'];a.state.selections.time=45;a.generateRecommendation();
  const candidates=a.additionCandidates('Shopping').map(c=>c.place.id);assert.ok(candidates.includes('west_village'));assert.ok(candidates.includes('boundary_precinct'));
  await click('#add-stop');await click('[data-add-category="Shopping"]');await click('[data-add-place="west_village"]');
  assert.equal(a.state.stopDurations.west_village,20);a.openPlaceDetails('west_village');assert.match(d.querySelector('#dog-facts').textContent,/Pet-friendly outdoor retail areas/);assert.match(d.querySelector('#place-description').textContent,/individual cafés/);assert.match(d.querySelector('#google-maps-link').href,/West%20Village/);assert.doesNotMatch(d.querySelector('#place-rating').textContent,/★/);await click('#close-place');
  await click('[data-change="west_village"]');await click('[data-change-category="Shopping"]');await click('[data-change-place="boundary_precinct"]');assert.ok(!a.state.recommendedStops.includes('west_village'));assert.ok(a.state.recommendedStops.includes('boundary_precinct'));
  const changedRoute=a.selectedRoute(),geometryBefore=plain(changedRoute.coordinates),timeBefore=a.itineraryTiming(changedRoute).totalMinutes;
  await click('[data-duration="boundary_precinct"]');
  const durationChoice=[...d.querySelectorAll('#duration-options [data-minutes]')]
    .find(button=>Number(button.dataset.minutes)!==a.state.stopDurations.boundary_precinct);
  assert.ok(durationChoice);await click(`#duration-options [data-minutes="${durationChoice.dataset.minutes}"]`);
  await click('#save-duration');
  assert.deepEqual(plain(a.selectedRoute().coordinates),geometryBefore);
  assert.notEqual(a.itineraryTiming(a.selectedRoute()).totalMinutes,timeBefore);
  a.state.selections.activities=['Café or food','Shopping'];
  await click('[data-remove="boundary_precinct"]');
  assert.equal(d.querySelector('#remove-backdrop').classList.contains('is-hidden'),false);
  assert.match(d.querySelector('#remove-message').textContent,/Shopping/);
  await click('#confirm-remove');
  assert.ok(!a.state.recommendedStops.includes('boundary_precinct'));
  assert.ok(a.selectedRoute().coordinates.length>1);
  console.log('PASS Shopping recommendation, Add both candidates, West Village metadata, 20-minute duration and shopping Change');
  const osmEdges=new Set();
  for(const prepared of Object.values(a.ROUTE_PATHS.routes)) for(const variant of [prepared,prepared.alternative]) {
    if(!variant?.path) continue;
    variant.path.slice(1).forEach((index,k)=>osmEdges.add(edge(a.ROUTE_PATHS.points[variant.path[k]],a.ROUTE_PATHS.points[index])));
  }
  for(const prepared of Object.values(a.OUTING_ROUTES))
    prepared.coordinates.slice(1).forEach((point,k)=>osmEdges.add(edge(prepared.coordinates[k],point)));
  for(const route of Object.values(a.ROUTE_VARIANTS).filter(r=>!r.hidden)) {
    route.coordinates.slice(1).forEach((point,k)=>{
      const seamMeters=Math.hypot((point[0]-route.coordinates[k][0])*111195,
        (point[1]-route.coordinates[k][1])*98650);
      assert.ok(osmEdges.has(edge(route.coordinates[k],point)) || seamMeters<12,
        route.id+' unprepared edge '+k+' ('+seamMeters.toFixed(1)+' m)');
    });
    route.placeIds.forEach((id,k)=>{
      const point=route.coordinates[route.stopIndexes[k]],place=a.PLACES[id];
      const meters=Math.hypot((point[0]-place.latitude)*111195,(point[1]-place.longitude)*98650);
      assert.ok(meters<120,route.id+' stop '+id+' disconnected '+meters.toFixed(1)+'m');
    });
  }
  console.log('PASS all reachable primary, Plan B and manual paths use prepared walkable OSM edges and connected stop waypoints');
  for(const [activities,minutes] of [
    [['Market','Riverside walk'],90],
    [['Café or food','Shopping'],75],
    [['Riverside walk','Rest or picnic'],45]
  ]) {
    a.state.selections.activities=activities;a.state.selections.time=minutes;
    a.state.selections.preferences=['No specific preference'];a.state.planSignature=null;
    assert.notEqual(a.generateRecommendation(),false);
    const route=a.selectedRoute(),coverage=a.activityCoverage(route);
    assert.equal(coverage.uncoveredActivities.length,0,activities.join(', '));
    if(a.itineraryTiming(route).totalMinutes>minutes)
      assert.match(d.querySelector('#plan-time-message').textContent,/over your planned time/);
  }
  console.log('PASS activity coverage and duration model for Market + river 90, café + Shopping 75, river + picnic 45');
  a.state.selections.activities=['Market','Riverside walk'];
  a.state.selections.time=90;
  a.state.selections.preferences=['Needs easier access to water'];a.state.planSignature=null;
  assert.notEqual(a.generateRecommendation(),false);
  const waterRoute=a.selectedRoute(),waterB=a.ROUTE_VARIANTS[waterRoute.planB];
  assert.ok(a.facilityPairEligible(waterRoute,'Water'));
  assert.ok(a.routeFacilities(waterRoute).some(f=>f.kind==='Water'));
  assert.ok(a.routeFacilities(waterB).some(f=>f.kind==='Water'));
  a.startNavigation();await tick();
  const initialMeters=a.facilityDistanceOnRoute(waterRoute,waterRoute.navigationSteps[0],'Water');
  assert.ok(initialMeters!==null && initialMeters>=0);
  assert.notEqual(d.querySelector('#water-distance').textContent,'—');
  while(!a.navigation.alert && !d.querySelector('#next-step').disabled) {a.advanceNavigation();await tick();}
  await click('#switch-route');
  const remainingWater=a.facilityDistanceOnRoute(waterB,waterB.navigationSteps[a.navigation.step],'Water');
  assert.equal(d.querySelector('#water-distance').textContent==='—',remainingWater===null);
  await click('#end-outing');
  assert.equal(d.querySelector('#completion-screen').classList.contains('is-hidden'),false);
  assert.ok(a.navigation.walkedMeters<a.routeFacilities(waterB).length+a.ROUTE_VARIANTS[waterB.id].meters);
  await click('#completion-done');
  a.state.selections.preferences=['No specific preference'];a.state.planSignature=null;
  a.generateRecommendation();
  assert.ok(Object.values(a.ROUTE_VARIANTS).some(r=>!r.hidden&&!r.manualEdit&&!a.facilityPairEligible(r,'Water')));
  console.log('PASS required water on primary/Plan B, truthful along-route distance, removal of hard filter and partial manual completion');
  await click('[data-editor="preferences"]');
  await click('[data-option="Prefers fewer dogs"]');
  await click('#save-editor');
  assert.equal(a.state.screen,'profile-prompt');
  await click('#skip-preferences');
  assert.equal(w.localStorage.getItem('savedDogProfile'),null);
  assert.ok(a.state.currentOutingDogPreferences.includes('Prefers fewer dogs'));
  await click('[data-editor="preferences"]');
  await click('[data-option="Needs easier access to water"]');
  await click('#save-editor');await click('#save-preferences');
  d.querySelector('#dog-name-input').value='Milo';await click('#save-dog-name');
  assert.equal(JSON.parse(w.localStorage.getItem('savedDogProfile')).name,'Milo');
  assert.equal(d.querySelector('#companions-value').textContent,'Milo');
  assert.ok(JSON.parse(w.localStorage.getItem('savedDogProfile')).preferences.includes('Needs easier access to water'));
  a.state.selections.activities=['Market','Riverside walk'];a.state.selections.time=90;
  a.state.planSignature=null;a.generateRecommendation();
  a.startNavigation();await tick();await click('#end-outing');await click('#completion-done');
  assert.ok(a.state.selections.preferences.includes('Needs easier access to water'));
  assert.equal(w.localStorage.getItem('savedDogProfile')!==null,true);
  const reload=new JSDOM(fs.readFileSync('templates/index.html','utf8'),
    {runScripts:'outside-only',url:'http://localhost:5000'});
  reload.window.localStorage.setItem('savedDogProfile',w.localStorage.getItem('savedDogProfile'));
  reload.window.eval(fs.readFileSync('static/js/app.js','utf8'));
  assert.equal(reload.window.document.querySelector('#companions-value').textContent,'Milo');
  assert.match(reload.window.document.querySelector('#preferences-value').textContent,/Prefers fewer dogs/);
  const rd=reload.window.document;
  rd.querySelector('[data-editor="preferences"]').click();
  rd.querySelector('[data-option="No specific preference"]').click();
  rd.querySelector('#save-editor').click();rd.querySelector('#skip-preferences').click();
  rd.querySelector('[data-editor="companions"]').click();
  rd.querySelector('#dog-name-input').value='Milo II';rd.querySelector('#save-dog-name').click();
  assert.ok(JSON.parse(reload.window.localStorage.getItem('savedDogProfile')).preferences
    .includes('Needs easier access to water'));
  assert.equal(rd.querySelector('#preferences-value').textContent,'No specific preference');
  reload.window.close();
  console.log('PASS Not now retains outing-only preferences; Save/name persists profile in localStorage');
  await click('[data-editor="time"]');
  const hours=d.querySelector('#duration-hours'),minutes=d.querySelector('#duration-minutes');
  hours.value='0';minutes.value='25';minutes.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelector('#save-editor').disabled,true);
  hours.value='3';minutes.value='5';minutes.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelector('#save-editor').disabled,true);
  hours.value='1';minutes.value='15';minutes.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelector('#save-editor').disabled,false);
  await click('#save-editor');
  assert.equal(a.state.selections.time,75);
  assert.equal(d.querySelector('#time-value').textContent,'1 hr 15 min');
  assert.deepEqual([...minutes.options].map(option=>Number(option.value)),
    [0,5,10,15,20,25,30,35,40,45,50,55]);
  console.log('PASS duration picker 30–180 min, five-minute increments and natural display');
  const stylesheet=fs.readFileSync('static/css/styles.css','utf8');
  assert.match(stylesheet,/\.leaflet-tile-pane\s*\{\s*filter:/);
  assert.match(stylesheet,/@media \(max-width:599px\)[\s\S]*height:100dvh/);
  assert.ok(!/\.leaflet-overlay-pane\s*\{\s*filter:/.test(stylesheet));
  const ids=[...d.querySelectorAll('[id]')].map(element=>element.id);
  assert.equal(new Set(ids).size,ids.length);
  console.log('PASS static 390×844 CSS frame/control checks, tile-only map filter and unique DOM IDs');
  assert.deepEqual(errors,[]);dom.window.close();
}
run().catch(e=>{console.error(e.stack);dom.window.close();process.exitCode=1});
