import escapeHtml from 'escape-html'

const toMetaTag = ({prop, name, content}) => `<meta ${prop}="${name}" content="${escapeHtml(content)}"/>`

const toMetaTags = metas => metas.map(toMetaTag).join('\n')

const HTML = (metas, title, state, bundlePath = '/' ) => `<!DOCTYPE html>
<html style="height: 100%; width: 100%;">
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    ${toMetaTags(metas)}
    <link href="https://fonts.googleapis.com/css?family=Lato&display=swap" rel="stylesheet">
    <link href="/main.css" rel="stylesheet">
  <!-- start Mixpanel --><script type="text/javascript">(function(c,a){if(!a.__SV){var b=window;try{var d,m,j,k=b.location,f=k.hash;d=function(a,b){return(m=a.match(RegExp(b+"=([^&]*)")))?m[1]:null};f&&d(f,"state")&&(j=JSON.parse(decodeURIComponent(d(f,"state"))),"mpeditor"===j.action&&(b.sessionStorage.setItem("_mpcehash",f),history.replaceState(j.desiredHash||"",c.title,k.pathname+k.search)))}catch(n){}var l,h;window.mixpanel=a;a._i=[];a.init=function(b,d,g){function c(b,i){var a=i.split(".");2==a.length&&(b=b[a[0]],i=a[1]);b[i]=function(){b.push([i].concat(Array.prototype.slice.call(arguments, 0)))}}var e=a;"undefined"!==typeof g?e=a[g]=[]:g="mixpanel";e.people=e.people||[];e.toString=function(b){var a="mixpanel";"mixpanel"!==g&&(a+="."+g);b||(a+=" (stub)");return a};e.people.toString=function(){return e.toString(1)+".people (stub)"};l="disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for(h=0;h<l.length;h++)c(e,l[h]);var f="set set_once union unset remove delete".split(" ");e.get_group=function(){function a(c){b[c]=function(){call2_args=arguments;call2=[c].concat(Array.prototype.slice.call(call2_args,0));e.push([d,call2])}}for(var b={},d=["get_group"].concat(Array.prototype.slice.call(arguments,0)),c=0;c<f.length;c++)a(f[c]);return b};a._i.push([b,d,g])};a.__SV=1.2;b=c.createElement("script");b.type="text/javascript";b.async=!0;b.src="undefined"!==typeof MIXPANEL_CUSTOM_LIB_URL? MIXPANEL_CUSTOM_LIB_URL:"file:"===c.location.protocol&&"//cdn4.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\\/\\//)?"https://cdn4.mxpnl.com/libs/mixpanel-2-latest.min.js":"//cdn4.mxpnl.com/libs/mixpanel-2-latest.min.js";d=c.getElementsByTagName("script")[0];d.parentNode.insertBefore(b,d)}})(document,window.mixpanel||[]); mixpanel.init("7a3b54ec0be340470a083f1bed6e333c");</script><!-- end Mixpanel -->
  </head>
  <script>
    mixpanel.track("Page View");
    window.globalState=${JSON.stringify(state).replace(/</g, "\\u003c")};
  </script>
  <body style="height: 100%; margin: 0; width: 100%;">
    <div id="app"></div>
    <script src="${bundlePath}bundle.js"></script>
  </body>
</html>`

const meta = (prop, name, content) => {return {prop, name, content}}
const nameMeta = (name, content) => meta('name', name, content)
const ogMeta = (name, content) => meta('property', "og:" + name, content)
const twitterMeta = (name, content) => meta('name', "twitter:" + name, content)

function addAllMetas(metas, name, content) {
  metas.push(nameMeta(name, content))
  metas.push(ogMeta(name, content))
  metas.push(twitterMeta(name, content))
}

export default function createHtml({title, description, url, imageUrl, videoUrl, playerUrl, keywords, ogType, twitterType} = meta, state, bundlePath) {
  const metas = []

  if (title) {
    addAllMetas(metas, "title", title)
  }

  if (description) {
    addAllMetas(metas, "description", description)
  }

  if (url) {
    addAllMetas(metas, "url", url)
  }

  if(imageUrl) {
    addAllMetas(metas, "image", imageUrl)
  }

  if(keywords) {
    metas.push(nameMeta("keywords", keywords))
  }

  if (ogType) {
    metas.push(ogMeta("type", ogType))
  }
  if (twitterType) {
    metas.push(twitterMeta("card", twitterType))
  }

  if(videoUrl) {
    metas.push(ogMeta("video", videoUrl))
    metas.push(ogMeta("video:type", "video/mp4"))
    metas.push(ogMeta("video:width", "480"))
    metas.push(ogMeta("video:height", "480"))

    metas.push(twitterMeta("player", playerUrl))
    metas.push(twitterMeta("player:stream", videoUrl))
    metas.push(twitterMeta("player:width", "480"))
    metas.push(twitterMeta("player:height", "480"))
  }

 
  return HTML(metas, title, state, bundlePath)
}
