(()=>{
  'use strict';
  async function loadData(){
    const response=await fetch('/api/elite-picks',{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Stats2Pitch Elite feed unavailable');
    return response.json();
  }
  function usableItems(data){return Array.isArray(data?.items)?data.items.slice(0,10):[]}
  window.SportyEliteAvailability={source:'stats2pitch',loadData,usableItems};
})();
