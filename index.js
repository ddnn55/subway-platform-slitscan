import superagent from 'superagent';
import ShardedMapView from 'shardedmapview';

const info = require('./info.json');
console.log({info});

var spacer = document.querySelector('.spacer');
var mapEl = document.querySelector('.map');

spacer.style.height = '100vh';
spacer.style.width = `${info.aspect*100}vh`;

// var minZoom = 2;
// var center = {x: 176, y: 48};
var center = {"x":"30200","y":"-960"};

const urlForGlobalTileCoord = globalTileCoord => (
  `tiles/${globalTileCoord.z}/${globalTileCoord.y}/${globalTileCoord.x}.jpg`
);


let preload = {};
// let preload = Object.assign(
//   require('./preload/zoom-1.json'),
//   require('./preload/zoom-2.json')
// );

const D = v => new ShardedMapView.DecimalConfigured(v);
const denormalize = (value, range) => {
  // console.log({value: value.toString()})
  const span = D(range[1]).minus(range[0]);
  // console.log('span', span.toString());
  const valueTimesSpan = D(value).times(span);
  // console.log('valueTimesSpan', valueTimesSpan.toString());
  return D(range[0]).plus(valueTimesSpan)
};

// superagent.get('preload/all.json').end((err, res) => {
//   console.log({res});
//   Object.assign(preload, res.body);
//   console.log(`preloaded ${Object.keys(res.body).length} tiles`);
// });

const localOlMinZoom = 0;
const localOlMaxZoom = 32;

window.olView = new ol.View({
  zoom: localOlMinZoom,
  minZoom: localOlMinZoom,
  maxZoom: localOlMaxZoom
});
window.map = new ol.Map({
  renderer: 'canvas',
  interactions: ol.interaction.defaults().extend([
    new ol.interaction.DragRotateAndZoom()
  ]),
  target: 'map',
  logo: false,
  controls: [],
  view: olView,
  loadTilesWhileAnimating: true,
  loadTilesWhileInteracting: true
});

map.on('pointerup', function(e) {
  console.log(e.coordinate);
  console.log(JSON.stringify(globalView.activeShardCoordToGlobalCoord({
    x: e.coordinate[0],
    y: e.coordinate[1]
  })));
});
map.on('zoomend', map, function() {
  var zoomInfo = 'Zoom level=' + map.getZoom() + '/' + (map.numZoomLevels + 1);
  console.log(zoomInfo);
});
map.on('zoom', function(e) {
  console.log(e);
});

const viewExtent = olView.getProjection().getExtent();

let shardLayers = {};

const createShardLayer = shard => {
  return new ol.layer.Tile({
    source: new ol.source.XYZ({
      tileUrlFunction: function(tileCoord, pixelRatio, projection) {
        // console.log('start tileUrlFunction', arguments);
        const localTileCoord = {
          z: tileCoord[0],
          y: -1-tileCoord[2],
          x: tileCoord[1]
        };
        const globalTileCoord = shard.localTileCoordToGlobalTileCoord(localTileCoord);
        // console.info({globalTileCoord});
        const tile = ShardedMapView.Tile({
          zoom: globalTileCoord.z,
          row: globalTileCoord.y,
          column: globalTileCoord.x
        });
        if(tile.key() in preload) {
          // console.info(`${tile.key()} is in preload. using data URL`);
          return preload[tile.key()];
        }
        // else {
        //   return 'gray_test_tile.png';
        // }
        else {
          // console.info(tile.key());
          const url = urlForGlobalTileCoord(globalTileCoord);
          // console.log(`${tile.key()} is NOT in preload. loading from remote ${url}`);
          return url;
        }
        
      },
      // url: 'tiles/{z}/{y}/{x}.jpg',
      tilePixelRatio: 1,
      // tileSize: [256, 256],
      tileSize: [512, 512],
      // tileSize: [1024, 1024],
      minZoom: localOlMinZoom,
      maxZoom: localOlMaxZoom,
      wrapX: false
    })
  });
};

const getZoomToFitSceneHeightInViewport = () => {
  const viewportHeight = mapEl.getBoundingClientRect().height;
  const zoom = Math.log2(viewportHeight / (info.bounds.top - info.bounds.bottom));
  return zoom;
};

const getViewForProgress = progress => {
  // TODO use the previous call to this
  const mapRect = mapEl.getBoundingClientRect();
  const viewportAspect = mapRect.width / mapRect.height;
  const viewportWidthInSceneSpace = (info.bounds.top - info.bounds.bottom) * viewportAspect;
  // console.log({viewportWidthInSceneSpace});
  const halfViewportWidthInSceneSpace = viewportWidthInSceneSpace / 2;
  // console.log({halfViewportWidthInSceneSpace});
  const x = denormalize(progress, [
    D(info.bounds.left).plus(halfViewportWidthInSceneSpace),
    D(info.bounds.right).minus(halfViewportWidthInSceneSpace)
  ]);
  return {
    zoom: getZoomToFitSceneHeightInViewport(),
    center: {
      y: center.y,
      x
    }
  };
};

let activeShardLayer;
var globalView = ShardedMapView({
  shardExtent: ShardedMapView.Bounds({
    left: viewExtent[0],
    bottom: viewExtent[1],
    right: viewExtent[2],
    top: viewExtent[3]
  }),
  initialView: getViewForProgress(0),
  setActiveShard: shard => {
    shard.key()
    if(activeShardLayer) {
      //map.removeLayer(activeShardLayer);
      activeShardLayer.setVisible(false);
    }
    if(!shardLayers[shard.key()]) {
      shardLayers[shard.key()] = createShardLayer(shard);
      map.addLayer(shardLayers[shard.key()]);
    }
    activeShardLayer = shardLayers[shard.key()];
    activeShardLayer.setVisible(true);
    
  },
  setActiveShardView: view => {
    // console.log('setting local ol zoom to', view.zoom);
    olView.setZoom(view.zoom);
    olView.setCenter([view.center.x, view.center.y]);
    // console.info('set local view', view);
  }
});

var last_known_scroll_progress = 0;
var ticking = false;

function getScrollProgress() {
    const spacerRect = spacer.getBoundingClientRect();
    const mapRect = mapEl.getBoundingClientRect();
    const minX = -(spacerRect.width - mapRect.width);
    const maxX = 0;
    const progress = 1 - (spacerRect.left - minX) / (maxX - minX);
    return progress;
}

document.querySelector('.scroller').addEventListener('click', e => {
  console.log(globalView.zoom());
});


const replaceHash = value => {
  const url = window.location.href.substring(0, window.location.href.indexOf('#'));
  history.replaceState(null, '', `${url}#${value}`);
};
const getHash = () => {
  const hashIndex = window.location.href.indexOf('#');
  if(hashIndex > -1) {
    return window.location.href.substring(hashIndex+1);
  }
  else {
    return null;
  }
};

function doSomething(scroll_percent) {
  // console.log(info.bounds);
  // console.log(x.toString());
  globalView.setView(getViewForProgress(scroll_percent));
  // doEase();
  // replaceHash(zoomTarget);
}

function update(e) {
  last_known_scroll_progress = getScrollProgress();
  if (!ticking) {
    window.requestAnimationFrame(function() {
      doSomething(last_known_scroll_progress);
      ticking = false;
    });
  }
  ticking = true;
}

document.querySelector('.scroller').addEventListener('scroll', update);
window.addEventListener('resize', update);
