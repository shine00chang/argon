export const languageConfigs = {
  'Java': {
    srcFile: 'Solution.java',
    binaryFile: 'Solution.class',
    displayName: 'Java',
    compileCommand: '/usr/lib/jvm/java-8-openjdk-amd64/bin/javac {src_path}',
    executeCommand: '/usr/lib/jvm/java-8-openjdk-amd64/bin/java Solution',
    constraints: {
      time: 5000,
      memory: 262144,
      totalStorage: 262144,
      processes: 20
    }
  },
  'C++': {
    srcFile: 'program.cpp',
    binaryFile: 'a.out',
    displayName: 'C++20',
    compileCommand: '/usr/bin/g++ -o2 -w -fmax-errors=3 -std=c++20 {src_path} -lm -o {binary_path}',
    executeCommand: './{binary_path}',
    constraints: {
      time: 5000,
      memory: 262144,
      totalStorage: 262144,
      processes: 5
    }
  },
  Python: {
    srcFile: 'program.py',
    binaryFile: 'run.py',
    displayName: 'Python 3',
    compileCommand: '/usr/bin/cp {src_path} {binary_path}',
    executeCommand: '/usr/bin/python3 {binary_path}',
    constraints: {
      time: 1000,
      memory: 262144,
      totalStorage: 262144,
      processes: 5
    }
  }
}
