
// Hanshin recurring delivery schedule, effective 2026-10-30 (Asia/Taipei).
// Extend existing functions without replacing the deployed order/payment code.
function hanshinWeeklyRules_() {
  return [1,2,3,4,5,6].map(function(day) {
    return {weekday:day,mall:'漢神洲際購物廣場',
      lunchOpen:day===6,dinnerOpen:day!==6,
      reason:'固定配送：週一至週五只送晚餐、週六只送午餐、週日午晚餐皆配送',
      effectiveFrom:'2026-10-30'};
  });
}
function hanshinWeeklyRule_(date,mall) {
  if(String(date)<'2026-10-30'||mall!=='漢神洲際購物廣場')return null;
  var day=new Date(String(date)+'T00:00:00Z').getUTCDay();
  return hanshinWeeklyRules_().filter(function(r){return r.weekday===day;})[0]||null;
}
var hanshinBasePublicOrdering_ = publicMallOrdering_;
publicMallOrdering_ = function(ss) {
  return hanshinBasePublicOrdering_(ss).concat(hanshinWeeklyRules_());
};
var hanshinBaseAvailability_ = mallOrderAvailability_;
mallOrderAvailability_ = function(ss,date,mealPeriod,mall) {
  var rule=hanshinWeeklyRule_(date,mall);
  if(rule&&((mealPeriod==='午餐'&&!rule.lunchOpen)||(mealPeriod==='晚餐'&&!rule.dinnerOpen)))
    return {open:false,message:mall+' '+date+' '+mealPeriod+'暫停配送：'+rule.reason};
  return hanshinBaseAvailability_(ss,date,mealPeriod,mall);
};
var hanshinBaseGetOrdering_ = getMallOrdering_;
getMallOrdering_ = function(token,date) {
  var result=hanshinBaseGetOrdering_(token,date);
  result.rows=result.rows.map(function(row) {
    var rule=hanshinWeeklyRule_(date,row.mall);
    if(!rule)return row;
    return {date:row.date,mall:row.mall,lunchOpen:row.lunchOpen&&rule.lunchOpen,
      dinnerOpen:row.dinnerOpen&&rule.dinnerOpen,
      reason:row.reason||rule.reason};
  });
  return result;
};
