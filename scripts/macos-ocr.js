// Executed by macOS JavaScript for Automation, not by Node.js.
ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  var request=$.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel=0; // VNRequestTextRecognitionLevelAccurate
  request.usesLanguageCorrection=true;
  var error=Ref();
  var languages=ObjC.deepUnwrap(request.supportedRecognitionLanguagesAndReturnError(error));
  if(!languages||!languages.length)throw new Error('Apple Vision未返回可用识别语言');
  var selected=languages.filter(function(l){return /^zh-Hans/.test(l);}).concat(languages.filter(function(l){return /^en-US/.test(l);}));
  if(!selected.length)selected=languages.slice(0,1);
  request.recognitionLanguages=$(selected);
  if(argv.indexOf('-Probe')>=0)return JSON.stringify({engine:'apple-vision',languages:selected,maxImageDimension:4000,limitSource:'workbench-normalization'});
  var input=argv[argv.indexOf('-InputPath')+1],output=argv[argv.indexOf('-OutputPath')+1];
  if(!input||!output)throw new Error('需要输入图片和输出路径');
  var handler=$.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(input),$.NSDictionary.dictionary);
  if(!handler.performRequestsError($([request]),error))throw new Error('Apple Vision识别失败，请检查图片和系统版本');
  var observations=request.results,lines=[];
  for(var i=0;i<Number(observations.count);i++) {
    var observation=observations.objectAtIndex(i),candidates=observation.topCandidates(1);
    if(Number(candidates.count)===0)continue;
    var candidate=candidates.objectAtIndex(0);
    lines.push({text:ObjC.unwrap(candidate.string),confidence:Number(candidate.confidence),words:[]});
  }
  var result={engine:'apple-vision',languages:selected,text:lines.map(function(l){return l.text;}).join('\n'),lines:lines,confidence:null};
  if(!$(JSON.stringify(result)).writeToFileAtomicallyEncodingError(output,true,$.NSUTF8StringEncoding,error))throw new Error('无法写入识别结果');
  return JSON.stringify({ok:true,lines:lines.length});
}
