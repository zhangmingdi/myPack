const path = require('path')
const fs = require('fs')
const babylon = require('babylon')
const traverse = require('@babel/traverse').default
const generator = require('@babel/generator').default
const t = require('@babel/types')
const ejs = require('ejs')
class Compiler {
    constructor(config) {
        // webpack整体配置
        this.config = config
        // 入口id
        this.entryId
        // 模块对象
        this.modules = {}

        this.entry = config.entry
        // 获取根目录
        this.root = process.cwd()
    }

    getSource(modulePath) {
        const content = fs.readFileSync(modulePath, 'utf-8')
        return content
    }
    parse(content, parentPath) {
        const ast = babylon.parse(content)
        const dependencies = []
        traverse(ast, {
            CallExpression(p) {
                const node = p.node
                if (node.callee.name === 'require') {
                    node.callee.name = "__webpack_require__"
                    let moduleName = node.arguments[0].value
                    moduleName = moduleName + (path.extname(moduleName) ? '' : '.js')
                    moduleName = './' + path.join(parentPath, moduleName)
                    dependencies.push(moduleName)
                    node.arguments = [t.stringLiteral(moduleName)]
                }
            }
        })
        const sourceCode = generator(ast).code
        return {
            dependencies,
            sourceCode
        }
    }
    buildModule(modulePath, isEntry) {
        // 获取代码字符串
        const content = this.getSource(modulePath)

        // 拼接Key
        const moduleName = './' + path.relative(this.root, modulePath)

        if (isEntry) {
            this.entryId = moduleName
        }
        const { sourceCode, dependencies } = this.parse(content, path.dirname(moduleName))
        this.modules[moduleName] = sourceCode
        dependencies?.forEach(dep => {
            this.buildModule(path.join(this.root, dep), false)
        })
    }
    emitFile() {
        const main = path.join(this.config.output.path, this.config.output.filename)
        const templateStr = this.getSource(path.join(__dirname, 'main.ejs'))
        const code = ejs.render(templateStr, {
            entryId: this.entryId,
            modules: this.modules
        })
        this.assets = {}
        this.assets[main] = code
        fs.writeFileSync(main, this.assets[main])
    }
    run() {
        // 执行并创建块的依赖关系
        this.buildModule(path.resolve(this.root, this.entry), true)
        this.emitFile()
    }
}


module.exports = Compiler