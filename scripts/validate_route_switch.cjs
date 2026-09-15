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
w.eval(['static/data/places.js','static/data/route-paths.js','static/data/routes.js','static/js/app.js','static/js/recommendation.js','static/js/map.js','static/js/navigation.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\nwindow.testApp={state,PLACES,ROUTE_VARIANTS,ROUTE_PATHS,outingMap,navigation,selectedRoute,generateRecommendation,activityCoverage,itineraryTiming,routeSummary,startNavigation,advanceNavigation,decideRoute,closeMap,additionCandidates,openPlaceDetails,editedSubsetRoute};');
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
      assert.match(d.querySelector('#map-title').textContent,/complete/);a.closeMap();
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
  a.state.selections.activities=['Shopping'];a.state.selections.time='60 min';a.state.planSignature=null;a.generateRecommendation();assert.ok(a.state.recommendedStops.some(id=>['west_village','boundary_precinct'].includes(id)));
  a.state.selections.activities=['Café or food'];a.state.selections.time='45 min';a.generateRecommendation();
  const candidates=a.additionCandidates('Shopping').map(c=>c.place.id);assert.ok(candidates.includes('west_village'));assert.ok(candidates.includes('boundary_precinct'));
  await click('#add-stop');await click('[data-add-category="Shopping"]');await click('[data-add-place="west_village"]');
  assert.equal(a.state.stopDurations.west_village,20);a.openPlaceDetails('west_village');assert.match(d.querySelector('#dog-facts').textContent,/Pet-friendly outdoor retail areas/);assert.match(d.querySelector('#place-description').textContent,/individual cafés/);assert.match(d.querySelector('#google-maps-link').href,/West%20Village/);assert.doesNotMatch(d.querySelector('#place-rating').textContent,/★/);await click('#close-place');
  await click('[data-change="west_village"]');await click('[data-place-id="boundary_precinct"]');assert.ok(!a.state.recommendedStops.includes('west_village'));assert.ok(a.state.recommendedStops.includes('boundary_precinct'));
  console.log('PASS Shopping recommendation, Add both candidates, West Village metadata, 20-minute duration and shopping Change');
  assert.deepEqual(errors,[]);dom.window.close();
}
run().catch(e=>{console.error(e.stack);dom.window.close();process.exitCode=1});
