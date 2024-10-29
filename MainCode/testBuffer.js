const type = "FRIENDREQUEST";
const buffer1 = Buffer.alloc(60);
const buffer2 = Buffer.alloc(type.length);
buffer1.write("wo")
buffer2.write(type)
buffer3 = Buffer.concat([buffer1, Buffer.from('|'), buffer2])
console.log(buffer3.length)
console.log(buffer3.toString('utf-8'))
console.log(buffer3.toString('utf-8', 60, 73))

// const buffer2 = Buffer.alloc(20);
// buffer2.write("jyId_15779528372")
// console.log(buffer2)
// console.log(buffer2.toString('utf-8'))

// const buffer3 = Buffer.alloc(20);
// buffer3.write("1713677506709")
// console.log(buffer3)
// console.log(buffer3.toString('utf-8'))

// const buffer4 = Buffer.concat([buffer1, buffer2, buffer3])
// console.log(buffer4)
// console.log(buffer4.toString('utf-8'))

// console.log(buffer4.toString('utf-8', 0, 20))
// console.log(buffer4.toString('utf-8', 20, 40))
// console.log(buffer4.toString('utf-8', 40, 60))
