// let promise1 = new Promise((resolve, reject) => {
//   setTimeout(() => {
//     resolve('Promise 1 resolved!');
//   }, 1000);
// });

// promise1
//   .then(result => {
//     console.log(result); // 输出: Promise 1 resolved!  

//     // 创建一个新的 Promise 并返回它  
//     return new Promise((resolve, reject) => {
//       setTimeout(() => {
//         reject('Nested Promise rejected, and it is returned!');
//       }, 500);
//     });
//   })
//   .then(nestedResult => {
//     // 这个 then 不会被调用，因为上面的 Promise 被拒绝了  
//     console.log(nestedResult);
//   })
//   .catch(error => {
//     console.log('First catch:', error); // 输出: Nested Promise rejected, and it is returned!  
//     // 在这里你可以选择重新抛出错误，或者处理错误并结束链  
//   })
//   .then(result => {
//     // 这个 then 只有在前面的 catch 没有重新抛出错误时才会执行  
//     console.log('This will run if the error is not rethrown');
//   })
//   .catch(error => {
//     console.log('Second catch:', error); // 如果第一个 catch 重新抛出错误，这个 catch 会被调用  
//   });

// const fs = require('fs')

// fs.writeFile(`C:\\Users\\zzq\\Desktop\\ChatAppData\\fdsafagc.txt`, "iniasdhf", {encoding:'utf-8'}, err => {
//   if (err) {  
//     console.error('写入文件时发生错误:', err);  
//   } else {  
//     console.log('文件已成功写入');  
//   } 
// })

import { stringify, v4 as uuidv4 } from 'uuid';

console.log("uuid", uuidv4());