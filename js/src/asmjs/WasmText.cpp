/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * vim: set ts=8 sts=4 et sw=4 tw=99:
 *
 * Copyright 2015 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "asmjs/WasmText.h"

#include "mozilla/CheckedInt.h"
#include "mozilla/Maybe.h"

#include "jsnum.h"
#include "jsprf.h"
#include "jsstr.h"

#include "asmjs/WasmBinary.h"
#include "ds/LifoAlloc.h"
#include "js/CharacterEncoding.h"
#include "js/HashTable.h"

using namespace js;
using namespace js::wasm;
using mozilla::CheckedInt;
using mozilla::Maybe;

static const unsigned AST_LIFO_DEFAULT_CHUNK_SIZE = 4096;

/*****************************************************************************/
// wasm AST

class WasmAstExpr;

template <class T>
using WasmAstVector = mozilla::Vector<T, 0, LifoAllocPolicy<Fallible>>;

template <class K, class V, class HP>
using WasmAstHashMap = HashMap<K, V, HP, LifoAllocPolicy<Fallible>>;

typedef WasmAstVector<ValType> WasmAstValTypeVector;
typedef WasmAstVector<WasmAstExpr*> WasmAstExprVector;

struct WasmAstBase
{
    void* operator new(size_t numBytes, LifoAlloc& astLifo) throw() {
        return astLifo.alloc(numBytes);
    }
};

class WasmAstSig : public WasmAstBase
{
    WasmAstValTypeVector args_;
    ExprType ret_;

  public:
    WasmAstSig(WasmAstValTypeVector&& args, ExprType ret)
      : args_(Move(args)),
        ret_(ret)
    {}
    WasmAstSig(WasmAstSig&& rhs)
      : args_(Move(rhs.args_)),
        ret_(rhs.ret_)
    {}
    const WasmAstValTypeVector& args() const {
        return args_;
    }
    ExprType ret() const {
        return ret_;
    }

    typedef const WasmAstSig& Lookup;
    static HashNumber hash(Lookup sig) {
        return AddContainerToHash(sig.args(), HashNumber(sig.ret()));
    }
    static bool match(const WasmAstSig* lhs, Lookup rhs) {
        return lhs->ret() == rhs.ret() && EqualContainers(lhs->args(), rhs.args());
    }
};

enum class WasmAstKind
{
    Block,
    Call,
    Const,
    Export,
    Func,
    GetLocal,
    Import,
    Module,
    Nop,
    SetLocal
};

class WasmAstNode : public WasmAstBase
{
    const WasmAstKind kind_;

  public:
    explicit WasmAstNode(WasmAstKind kind)
      : kind_(kind)
    {}
    WasmAstKind kind() const { return kind_; }
};

class WasmAstExpr : public WasmAstNode
{
  protected:
    explicit WasmAstExpr(WasmAstKind kind)
      : WasmAstNode(kind)
    {}

  public:
    template <class T>
    T& as() {
        MOZ_ASSERT(kind() == T::Kind);
        return static_cast<T&>(*this);
    }
};

struct WasmAstNop : WasmAstExpr
{
    WasmAstNop()
      : WasmAstExpr(WasmAstKind::Nop)
    {}
};

class WasmAstConst : public WasmAstExpr
{
    const Val val_;

  public:
    static const WasmAstKind Kind = WasmAstKind::Const;
    explicit WasmAstConst(Val val)
      : WasmAstExpr(Kind),
        val_(val)
    {}
    Val val() const { return val_; }
};

class WasmAstGetLocal : public WasmAstExpr
{
    uint32_t localIndex_;

  public:
    static const WasmAstKind Kind = WasmAstKind::GetLocal;
    explicit WasmAstGetLocal(uint32_t localIndex)
      : WasmAstExpr(Kind),
        localIndex_(localIndex)
    {}
    uint32_t localIndex() const {
        return localIndex_;
    }
};

class WasmAstSetLocal : public WasmAstExpr
{
    uint32_t localIndex_;
    WasmAstExpr& value_;

  public:
    static const WasmAstKind Kind = WasmAstKind::SetLocal;
    WasmAstSetLocal(uint32_t localIndex, WasmAstExpr& value)
      : WasmAstExpr(Kind),
        localIndex_(localIndex),
        value_(value)
    {}
    uint32_t localIndex() const {
        return localIndex_;
    }
    WasmAstExpr& value() const {
        return value_;
    }
};

class WasmAstBlock : public WasmAstExpr
{
    WasmAstExprVector exprs_;

  public:
    static const WasmAstKind Kind = WasmAstKind::Block;
    explicit WasmAstBlock(WasmAstExprVector&& exprs)
      : WasmAstExpr(Kind),
        exprs_(Move(exprs))
    {}

    const WasmAstExprVector& exprs() const { return exprs_; }
};

class WasmAstCall : public WasmAstExpr
{
    Expr expr_;
    uint32_t index_;
    WasmAstExprVector args_;

  public:
    static const WasmAstKind Kind = WasmAstKind::Call;
    WasmAstCall(Expr expr, uint32_t index, WasmAstExprVector&& args)
      : WasmAstExpr(Kind), expr_(expr), index_(index), args_(Move(args))
    {}

    Expr expr() const { return expr_; }
    uint32_t index() const { return index_; }
    const WasmAstExprVector& args() const { return args_; }
};

class WasmAstFunc : public WasmAstNode
{
    const uint32_t sigIndex_;
    WasmAstValTypeVector varTypes_;
    WasmAstExpr* const maybeBody_;

  public:
    WasmAstFunc(uint32_t sigIndex, WasmAstValTypeVector&& varTypes, WasmAstExpr* maybeBody)
      : WasmAstNode(WasmAstKind::Func),
        sigIndex_(sigIndex),
        varTypes_(Move(varTypes)),
        maybeBody_(maybeBody)
    {}
    uint32_t sigIndex() const { return sigIndex_; }
    const WasmAstValTypeVector& varTypes() const { return varTypes_; }
    WasmAstExpr* maybeBody() const { return maybeBody_; }
};

class WasmAstImport : public WasmAstNode
{
    TwoByteChars module_;
    TwoByteChars func_;
    uint32_t sigIndex_;

  public:
    WasmAstImport(TwoByteChars module, TwoByteChars func, uint32_t sigIndex)
      : WasmAstNode(WasmAstKind::Import), module_(module), func_(func), sigIndex_(sigIndex)
    {}
    TwoByteChars module() const { return module_; }
    TwoByteChars func() const { return func_; }
    uint32_t sigIndex() const { return sigIndex_; }
};

class WasmAstExport : public WasmAstNode
{
    TwoByteChars name_;
    uint32_t funcIndex_;

  public:
    WasmAstExport(TwoByteChars name, uint32_t funcIndex)
      : WasmAstNode(WasmAstKind::Export), name_(name), funcIndex_(funcIndex)
    {}
    TwoByteChars name() const { return name_; }
    size_t funcIndex() const { return funcIndex_; }
};

class WasmAstModule : public WasmAstNode
{
    typedef WasmAstVector<WasmAstFunc*> FuncVector;
    typedef WasmAstVector<WasmAstImport*> ImportVector;
    typedef WasmAstVector<WasmAstExport*> ExportVector;
    typedef WasmAstVector<WasmAstSig*> SigVector;
    typedef WasmAstHashMap<WasmAstSig*, uint32_t, WasmAstSig> SigMap;

    LifoAlloc& lifo_;
    FuncVector funcs_;
    ImportVector imports_;
    ExportVector exports_;
    SigVector sigs_;
    SigMap sigMap_;

  public:
    explicit WasmAstModule(LifoAlloc& lifo)
      : WasmAstNode(WasmAstKind::Module),
        lifo_(lifo),
        funcs_(lifo),
        imports_(lifo),
        exports_(lifo),
        sigs_(lifo),
        sigMap_(lifo)
    {}
    bool init() {
        return sigMap_.init();
    }
    bool declare(WasmAstSig&& sig, uint32_t* sigIndex) {
        SigMap::AddPtr p = sigMap_.lookupForAdd(sig);
        if (p) {
            *sigIndex = p->value();
            return true;
        }
        *sigIndex = sigs_.length();
        return sigs_.append(new (lifo_) WasmAstSig(Move(sig))) &&
               sigMap_.add(p, sigs_.back(), *sigIndex);
    }
    const SigVector& sigs() const {
        return sigs_;
    }
    bool append(WasmAstFunc* func) {
        return funcs_.append(func);
    }
    const FuncVector& funcs() const {
        return funcs_;
    }
    const ImportVector& imports() const {
        return imports_;
    }
    bool append(WasmAstImport* imp) {
        return imports_.append(imp);
    }
    bool append(WasmAstExport* exp) {
        return exports_.append(exp);
    }
    const ExportVector& exports() const {
        return exports_;
    }
};

/*****************************************************************************/
// wasm text token stream

class WasmToken
{
  public:
    enum Kind
    {
        Block,
        Call,
        CallImport,
        CloseParen,
        Const,
        EndOfFile,
        Error,
        Export,
        Func,
        GetLocal,
        Import,
        Integer,
        Local,
        Module,
        Name,
        Nop,
        OpenParen,
        Param,
        Result,
        SetLocal,
        Text,
        ValueType
    };
  private:
    Kind kind_;
    const char16_t* begin_;
    const char16_t* end_;
    union {
        uint32_t integer_;
        ValType valueType_;
    } u;
  public:
    explicit WasmToken() = default;
    WasmToken(Kind kind, const char16_t* begin, const char16_t* end)
      : kind_(kind),
        begin_(begin),
        end_(end)
    {
        MOZ_ASSERT(kind_ != Error);
        MOZ_ASSERT((kind == EndOfFile) == (begin == end));
    }
    explicit WasmToken(uint32_t integer, const char16_t* begin, const char16_t* end)
      : kind_(Integer),
        begin_(begin),
        end_(end)
    {
        MOZ_ASSERT(begin != end);
        u.integer_ = integer;
    }
    explicit WasmToken(Kind kind, ValType valueType, const char16_t* begin, const char16_t* end)
      : kind_(kind),
        begin_(begin),
        end_(end)
    {
        MOZ_ASSERT(begin != end);
        MOZ_ASSERT(kind_ == ValueType || kind_ == Const);
        u.valueType_ = valueType;
    }
    explicit WasmToken(const char16_t* begin)
      : kind_(Error),
        begin_(begin),
        end_(begin)
    {}
    Kind kind() const {
        return kind_;
    }
    const char16_t* begin() const {
        return begin_;
    }
    const char16_t* end() const {
        return end_;
    }
    TwoByteChars text() const {
        MOZ_ASSERT(kind_ == Text);
        MOZ_ASSERT(begin_[0] == '"');
        MOZ_ASSERT(end_[-1] == '"');
        MOZ_ASSERT(end_ - begin_ >= 2);
        return TwoByteChars(begin_ + 1, end_ - begin_ - 2);
    }
    uint32_t integer() const {
        MOZ_ASSERT(kind_ == Integer);
        return u.integer_;
    }
    ValType valueType() const {
        MOZ_ASSERT(kind_ == ValueType || kind_ == Const);
        return u.valueType_;
    }
};

static bool
IsWasmNewLine(char16_t c)
{
    return c == '\n';
}

static bool
IsWasmSpace(char16_t c)
{
    switch (c) {
      case ' ':
      case '\n':
      case '\r':
      case '\t':
      case '\v':
      case '\f':
        return true;
      default:
        return false;
    }
}

static bool
IsWasmDigit(char16_t c)
{
    return c >= '0' && c <= '9';
}

static bool
IsWasmLetter(char16_t c)
{
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

static bool
IsNameAfterDollar(char16_t c)
{
    return c == '_' || IsWasmDigit(c) || IsWasmLetter(c);
}

class WasmTokenStream
{
    static const uint32_t LookaheadSize = 2;

    const char16_t* cur_;
    const char16_t* const end_;
    const char16_t* lineStart_;
    unsigned line_;
    uint32_t lookaheadIndex_;
    uint32_t lookaheadDepth_;
    WasmToken lookahead_[LookaheadSize];

    bool consume(const char16_t* end, const char16_t* match) {
        const char16_t* p = cur_;
        for (; *match; p++, match++) {
            if (p == end || *p != *match)
                return false;
        }
        cur_ = p;
        return true;
    }
    WasmToken fail(const char16_t* begin) const {
        return WasmToken(begin);
    }
    WasmToken next() {
        while (cur_ != end_ && IsWasmSpace(*cur_)) {
            if (IsWasmNewLine(*cur_++)) {
                lineStart_ = cur_;
                line_++;
            }
        }

        if (cur_ == end_)
            return WasmToken(WasmToken::EndOfFile, cur_, cur_);

        const char16_t* begin = cur_++;
        switch (*begin) {
          case '"':
            do {
                if (cur_ == end_)
                    return fail(begin);
            } while (*cur_++ != '"');
            return WasmToken(WasmToken::Text, begin, cur_);

          case '$':
            while (cur_ != end_ && IsNameAfterDollar(*cur_))
                cur_++;
            return WasmToken(WasmToken::Name, begin, cur_);

          case '(':
            return WasmToken(WasmToken::OpenParen, begin, cur_);

          case ')':
            return WasmToken(WasmToken::CloseParen, begin, cur_);

          case '0': case '1': case '2': case '3': case '4':
          case '5': case '6': case '7': case '8': case '9': {
            CheckedInt<uint32_t> u32 = *begin - '0';
            while (cur_ != end_ && IsWasmDigit(*cur_)) {
                u32 *= 10;
                u32 += *cur_ - '0';
                if (!u32.isValid())
                    return fail(begin);
                cur_++;
            }
            return WasmToken(u32.value(), begin, cur_);
          }

          case 'b':
            if (consume(end_, MOZ_UTF16("lock")))
                return WasmToken(WasmToken::Block, begin, cur_);
            break;

          case 'c':
            if (consume(end_, MOZ_UTF16("all"))) {
                if (consume(end_, MOZ_UTF16("_import")))
                    return WasmToken(WasmToken::CallImport, begin, cur_);
                return WasmToken(WasmToken::Call, begin, cur_);
            }
            break;

          case 'e':
            if (consume(end_, MOZ_UTF16("xport")))
                return WasmToken(WasmToken::Export, begin, cur_);
            break;

          case 'f':
            if (consume(end_, MOZ_UTF16("unc")))
                return WasmToken(WasmToken::Func, begin, cur_);
            if (consume(end_, MOZ_UTF16("32"))) {
                if (consume(end_, MOZ_UTF16(".const")))
                    return WasmToken(WasmToken::Const, ValType::F32, begin, cur_);
                return WasmToken(WasmToken::ValueType, ValType::F32, begin, cur_);
            }
            if (consume(end_, MOZ_UTF16("64"))) {
                if (consume(end_, MOZ_UTF16(".const")))
                    return WasmToken(WasmToken::Const, ValType::F64, begin, cur_);
                return WasmToken(WasmToken::ValueType, ValType::F64, begin, cur_);
            }
            break;

          case 'g':
            if (consume(end_, MOZ_UTF16("et_local")))
                return WasmToken(WasmToken::GetLocal, begin, cur_);
            break;

          case 'i':
            if (consume(end_, MOZ_UTF16("32"))) {
                if (consume(end_, MOZ_UTF16(".const")))
                    return WasmToken(WasmToken::Const, ValType::I32, begin, cur_);
                return WasmToken(WasmToken::ValueType, ValType::I32, begin, cur_);
            }
            if (consume(end_, MOZ_UTF16("64"))) {
                if (consume(end_, MOZ_UTF16(".const")))
                    return WasmToken(WasmToken::Const, ValType::I64, begin, cur_);
                return WasmToken(WasmToken::ValueType, ValType::I64, begin, cur_);
            }
            if (consume(end_, MOZ_UTF16("mport")))
                return WasmToken(WasmToken::Import, begin, cur_);
            break;

          case 'l':
            if (consume(end_, MOZ_UTF16("ocal")))
                return WasmToken(WasmToken::Local, begin, cur_);
            break;

          case 'm':
            if (consume(end_, MOZ_UTF16("odule")))
                return WasmToken(WasmToken::Module, begin, cur_);
            break;

          case 'n':
            if (consume(end_, MOZ_UTF16("op")))
                return WasmToken(WasmToken::Nop, begin, cur_);
            break;

          case 'p':
            if (consume(end_, MOZ_UTF16("aram")))
                return WasmToken(WasmToken::Param, begin, cur_);
            break;

          case 'r':
            if (consume(end_, MOZ_UTF16("esult")))
                return WasmToken(WasmToken::Result, begin, cur_);
            break;

          case 's':
            if (consume(end_, MOZ_UTF16("et_local")))
                return WasmToken(WasmToken::SetLocal, begin, cur_);
            break;

          default:
            break;
        }

        return fail(begin);
    }

  public:
    WasmTokenStream(const char16_t* text, UniqueChars* error)
      : cur_(text),
        end_(text + js_strlen(text)),
        lineStart_(text),
        line_(0),
        lookaheadIndex_(0),
        lookaheadDepth_(0)
    {}
    void generateError(WasmToken token, UniqueChars* error) {
        unsigned column = token.begin() - lineStart_ + 1;
        error->reset(JS_smprintf("parsing wasm text at %u:%u", line_, column));
    }

    WasmToken peek() {
        if (!lookaheadDepth_) {
            lookahead_[lookaheadIndex_] = next();
            lookaheadDepth_ = 1;
        }
        return lookahead_[lookaheadIndex_];
    }
    WasmToken get() {
        static_assert(LookaheadSize == 2, "can just flip");
        if (lookaheadDepth_) {
            lookaheadDepth_--;
            WasmToken ret = lookahead_[lookaheadIndex_];
            lookaheadIndex_ ^= 1;
            return ret;
        }
        return next();
    }
    void unget(WasmToken token) {
        static_assert(LookaheadSize == 2, "can just flip");
        lookaheadDepth_++;
        lookaheadIndex_ ^= 1;
        lookahead_[lookaheadIndex_] = token;
    }

    // Helpers:
    bool getIf(WasmToken::Kind kind) {
        if (peek().kind() == kind) {
            get();
            return true;
        }
        return false;
    }
    bool match(WasmToken::Kind expect, WasmToken* token, UniqueChars* error) {
        *token = get();
        if (token->kind() == expect)
            return true;
        generateError(*token, error);
        return false;
    }
    bool match(WasmToken::Kind expect, UniqueChars* error) {
        WasmToken token;
        return match(expect, &token, error);
    }
};


/*****************************************************************************/
// wasm text format parser

struct WasmParseContext
{
    WasmTokenStream ts;
    LifoAlloc& lifo;
    UniqueChars* error;

    WasmParseContext(const char16_t* text, LifoAlloc& lifo, UniqueChars* error)
      : ts(text, error),
        lifo(lifo),
        error(error)
    {}
};

static WasmAstExpr*
ParseExprInsideParens(WasmParseContext& c);

static WasmAstExpr*
ParseExpr(WasmParseContext& c)
{
    if (!c.ts.match(WasmToken::OpenParen, c.error))
        return nullptr;

    WasmAstExpr* expr = ParseExprInsideParens(c);
    if (!expr)
        return nullptr;

    if (!c.ts.match(WasmToken::CloseParen, c.error))
        return nullptr;

    return expr;
}

static WasmAstBlock*
ParseBlock(WasmParseContext& c)
{
    WasmAstExprVector exprs(c.lifo);

    while (c.ts.getIf(WasmToken::OpenParen)) {
        WasmAstExpr* expr = ParseExprInsideParens(c);
        if (!expr || !exprs.append(expr))
            return nullptr;
        if (!c.ts.match(WasmToken::CloseParen, c.error))
            return nullptr;
    }

    return new(c.lifo) WasmAstBlock(Move(exprs));
}

static WasmAstCall*
ParseCall(WasmParseContext& c, Expr expr)
{
    WasmToken index;
    if (!c.ts.match(WasmToken::Integer, &index, c.error))
        return nullptr;

    WasmAstExprVector args(c.lifo);
    while (c.ts.getIf(WasmToken::OpenParen)) {
        WasmAstExpr* arg = ParseExprInsideParens(c);
        if (!arg || !args.append(arg))
            return nullptr;
        if (!c.ts.match(WasmToken::CloseParen, c.error))
            return nullptr;
    }

    return new(c.lifo) WasmAstCall(expr, index.integer(), Move(args));
}

static WasmAstConst*
ParseConst(WasmParseContext& c, WasmToken constToken)
{
    switch (constToken.valueType()) {
      case ValType::I32: {
        WasmToken val;
        if (!c.ts.match(WasmToken::Integer, &val, c.error))
            return nullptr;
        return new(c.lifo) WasmAstConst(Val(val.integer()));
      }
      default:
        c.ts.generateError(constToken, c.error);
        return nullptr;
    }
}

static WasmAstGetLocal*
ParseGetLocal(WasmParseContext& c)
{
    WasmToken localIndex;
    if (!c.ts.match(WasmToken::Integer, &localIndex, c.error))
        return nullptr;

    return new(c.lifo) WasmAstGetLocal(localIndex.integer());
}

static WasmAstSetLocal*
ParseSetLocal(WasmParseContext& c)
{
    WasmToken localIndex;
    if (!c.ts.match(WasmToken::Integer, &localIndex, c.error))
        return nullptr;

    WasmAstExpr* value = ParseExpr(c);
    if (!value)
        return nullptr;

    return new(c.lifo) WasmAstSetLocal(localIndex.integer(), *value);
}

static WasmAstExpr*
ParseExprInsideParens(WasmParseContext& c)
{
    WasmToken expr = c.ts.get();

    switch (expr.kind()) {
      case WasmToken::Nop:
        return new(c.lifo) WasmAstNop;
      case WasmToken::Block:
        return ParseBlock(c);
      case WasmToken::Call:
        return ParseCall(c, Expr::Call);
      case WasmToken::CallImport:
        return ParseCall(c, Expr::CallImport);
      case WasmToken::Const:
        return ParseConst(c, expr);
      case WasmToken::GetLocal:
        return ParseGetLocal(c);
      case WasmToken::SetLocal:
        return ParseSetLocal(c);
      default:
        c.ts.generateError(expr, c.error);
        return nullptr;
    }
}

static bool
ParseValueType(WasmParseContext& c, WasmAstValTypeVector* vec)
{
    WasmToken valueType;
    return c.ts.match(WasmToken::ValueType, &valueType, c.error) &&
           vec->append(valueType.valueType());
}

static bool
ParseResult(WasmParseContext& c, ExprType* result)
{
    if (*result != ExprType::Void) {
        c.ts.generateError(c.ts.peek(), c.error);
        return false;
    }

    WasmToken valueType;
    if (!c.ts.match(WasmToken::ValueType, &valueType, c.error))
        return false;

    *result = ToExprType(valueType.valueType());
    return true;
}

static WasmAstFunc*
ParseFunc(WasmParseContext& c, WasmAstModule* module)
{
    WasmAstValTypeVector vars(c.lifo);
    WasmAstValTypeVector args(c.lifo);
    ExprType result = ExprType::Void;

    WasmAstExpr* maybeBody = nullptr;
    while (c.ts.getIf(WasmToken::OpenParen) && !maybeBody) {
        WasmToken token = c.ts.get();
        switch (token.kind()) {
          case WasmToken::Local:
            if (!ParseValueType(c, &vars))
                return nullptr;
            break;
          case WasmToken::Param:
            if (!ParseValueType(c, &args))
                return nullptr;
            break;
          case WasmToken::Result:
            if (!ParseResult(c, &result))
                return nullptr;
            break;
          default:
            c.ts.unget(token);
            maybeBody = ParseExprInsideParens(c);
            if (!maybeBody)
                return nullptr;
            break;
        }
        if (!c.ts.match(WasmToken::CloseParen, c.error))
            return nullptr;
    }

    uint32_t sigIndex;
    if (!module->declare(WasmAstSig(Move(args), result), &sigIndex))
        return nullptr;

    return new(c.lifo) WasmAstFunc(sigIndex, Move(vars), maybeBody);
}

static WasmAstImport*
ParseImport(WasmParseContext& c, WasmAstModule* module)
{
    WasmToken moduleName;
    if (!c.ts.match(WasmToken::Text, &moduleName, c.error))
        return nullptr;

    WasmToken funcName;
    if (!c.ts.match(WasmToken::Text, &funcName, c.error))
        return nullptr;

    WasmAstValTypeVector args(c.lifo);
    ExprType result = ExprType::Void;

    while (c.ts.getIf(WasmToken::OpenParen)) {
        WasmToken token = c.ts.get();
        switch (token.kind()) {
          case WasmToken::Param:
            if (!ParseValueType(c, &args))
                return nullptr;
            break;
          case WasmToken::Result:
            if (!ParseResult(c, &result))
                return nullptr;
            break;
          default:
            c.ts.generateError(token, c.error);
            return nullptr;
        }
        if (!c.ts.match(WasmToken::CloseParen, c.error))
            return nullptr;
    }

    uint32_t sigIndex;
    if (!module->declare(WasmAstSig(Move(args), result), &sigIndex))
        return nullptr;

    return new(c.lifo) WasmAstImport(moduleName.text(), funcName.text(), sigIndex);
}

static WasmAstExport*
ParseExport(WasmParseContext& c)
{
    WasmToken name;
    if (!c.ts.match(WasmToken::Text, &name, c.error))
        return nullptr;

    WasmToken funcIndex;
    if (!c.ts.match(WasmToken::Integer, &funcIndex, c.error))
        return nullptr;

    return new(c.lifo) WasmAstExport(name.text(), funcIndex.integer());
}

static WasmAstModule*
TextToAst(const char16_t* text, LifoAlloc& lifo, UniqueChars* error)
{
    WasmParseContext c(text, lifo, error);

    if (!c.ts.match(WasmToken::OpenParen, c.error))
        return nullptr;
    if (!c.ts.match(WasmToken::Module, c.error))
        return nullptr;

    auto module = new(c.lifo) WasmAstModule(c.lifo);
    if (!module || !module->init())
        return nullptr;

    while (c.ts.getIf(WasmToken::OpenParen)) {
        WasmToken section = c.ts.get();

        switch (section.kind()) {
          case WasmToken::Import: {
            WasmAstImport* imp = ParseImport(c, module);
            if (!imp || !module->append(imp))
                return nullptr;
            break;
          }
          case WasmToken::Export: {
            WasmAstExport* exp = ParseExport(c);
            if (!exp || !module->append(exp))
                return nullptr;
            break;
          }
          case WasmToken::Func: {
            WasmAstFunc* func = ParseFunc(c, module);
            if (!func || !module->append(func))
                return nullptr;
            break;
          }
          default:
            c.ts.generateError(section, c.error);
            return nullptr;
        }

        if (!c.ts.match(WasmToken::CloseParen, c.error))
            return nullptr;
    }

    if (!c.ts.match(WasmToken::CloseParen, c.error))
        return nullptr;
    if (!c.ts.match(WasmToken::EndOfFile, c.error))
        return nullptr;

    return module;
}

/*****************************************************************************/
// wasm function body serialization

static bool
EncodeExpr(Encoder& e, WasmAstExpr& expr);

static bool
EncodeBlock(Encoder& e, WasmAstBlock& b)
{
    if (!e.writeExpr(Expr::Block))
        return false;

    size_t numExprs = b.exprs().length();
    if (!e.writeVarU32(numExprs))
        return false;

    for (size_t i = 0; i < numExprs; i++) {
        if (!EncodeExpr(e, *b.exprs()[i]))
            return false;
    }

    return true;
}

static bool
EncodeCall(Encoder& e, WasmAstCall& c)
{
    if (!e.writeExpr(c.expr()))
        return false;

    if (!e.writeU32(c.index()))
        return false;

    for (WasmAstExpr* arg : c.args()) {
        if (!EncodeExpr(e, *arg))
            return false;
    }

    return true;
}

static bool
EncodeConst(Encoder& e, WasmAstConst& c)
{
    switch (c.val().type()) {
      case ValType::I32:
        return e.writeExpr(Expr::I32Const) &&
               e.writeVarU32(c.val().i32());
      default:
        break;
    }
    MOZ_CRASH("Bad value type");
}

static bool
EncodeGetLocal(Encoder& e, WasmAstGetLocal& gl)
{
    return e.writeExpr(Expr::GetLocal) &&
           e.writeVarU32(gl.localIndex());
}

static bool
EncodeSetLocal(Encoder& e, WasmAstSetLocal& sl)
{
    return e.writeExpr(Expr::SetLocal) &&
           e.writeVarU32(sl.localIndex()) &&
           EncodeExpr(e, sl.value());
}

static bool
EncodeExpr(Encoder& e, WasmAstExpr& expr)
{
    switch (expr.kind()) {
      case WasmAstKind::Nop:
        return e.writeExpr(Expr::Nop);
      case WasmAstKind::Block:
        return EncodeBlock(e, expr.as<WasmAstBlock>());
      case WasmAstKind::Call:
        return EncodeCall(e, expr.as<WasmAstCall>());
      case WasmAstKind::Const:
        return EncodeConst(e, expr.as<WasmAstConst>());
      case WasmAstKind::GetLocal:
        return EncodeGetLocal(e, expr.as<WasmAstGetLocal>());
      case WasmAstKind::SetLocal:
        return EncodeSetLocal(e, expr.as<WasmAstSetLocal>());
      default:;
    }
    MOZ_CRASH("Bad expr kind");
}

/*****************************************************************************/
// wasm AST binary serialization

static bool
EncodeSignatureSection(Encoder& e, WasmAstModule& module)
{
    if (module.sigs().empty())
        return true;

    if (!e.writeCString(SigSection))
        return false;

    size_t offset;
    if (!e.startSection(&offset))
        return false;

    if (!e.writeVarU32(module.sigs().length()))
        return false;

    for (WasmAstSig* sig : module.sigs()) {
        if (!e.writeVarU32(sig->args().length()))
            return false;

        if (!e.writeExprType(sig->ret()))
            return false;

        for (ValType t : sig->args()) {
            if (!e.writeValType(t))
                return false;
        }
    }

    e.finishSection(offset);
    return true;
}

static bool
EncodeDeclarationSection(Encoder& e, WasmAstModule& module)
{
    if (module.funcs().empty())
        return true;

    if (!e.writeCString(DeclSection))
        return false;

    size_t offset;
    if (!e.startSection(&offset))
        return false;

    if (!e.writeVarU32(module.funcs().length()))
        return false;

    for (WasmAstFunc* func : module.funcs()) {
        if (!e.writeVarU32(func->sigIndex()))
            return false;
    }

    e.finishSection(offset);
    return true;
}

static bool
EncodeImport(Encoder& e, WasmAstImport& imp)
{
    if (!e.writeCString(FuncSubsection))
        return false;

    if (!e.writeVarU32(imp.sigIndex()))
        return false;

    UniqueChars moduleChars(JS::CharsToNewUTF8CharsZ(nullptr, imp.module()).c_str());
    if (!moduleChars)
        return false;

    if (!e.writeCString(moduleChars.get()))
        return false;

    UniqueChars funcChars(JS::CharsToNewUTF8CharsZ(nullptr, imp.func()).c_str());
    if (!funcChars)
        return false;

    if (!e.writeCString(funcChars.get()))
        return false;

    return true;
}

static bool
EncodeImportSection(Encoder& e, WasmAstModule& module)
{
    if (module.imports().empty())
        return true;

    if (!e.writeCString(ImportSection))
        return false;

    size_t offset;
    if (!e.startSection(&offset))
        return false;

    if (!e.writeVarU32(module.imports().length()))
        return false;

    for (WasmAstImport* imp : module.imports()) {
        if (!EncodeImport(e, *imp))
            return false;
    }

    e.finishSection(offset);
    return true;
}

static bool
EncodeExport(Encoder& e, WasmAstExport& exp)
{
    if (!e.writeCString(FuncSubsection))
        return false;

    if (!e.writeVarU32(exp.funcIndex()))
        return false;

    UniqueChars utf8Name(JS::CharsToNewUTF8CharsZ(nullptr, exp.name()).c_str());
    if (!utf8Name)
        return false;

    if (!e.writeCString(utf8Name.get()))
        return false;

    return true;
}

static bool
EncodeExportSection(Encoder& e, WasmAstModule& module)
{
    if (module.exports().empty())
        return true;

    if (!e.writeCString(ExportSection))
        return false;

    size_t offset;
    if (!e.startSection(&offset))
        return false;

    if (!e.writeVarU32(module.exports().length()))
        return false;

    for (WasmAstExport* exp : module.exports()) {
        if (!EncodeExport(e, *exp))
            return false;
    }

    e.finishSection(offset);
    return true;
}

static bool
EncodeFunc(Encoder& e, WasmAstFunc& func)
{
    if (!e.writeCString(FuncSubsection))
        return false;

    size_t offset;
    if (!e.startSection(&offset))
        return false;

    if (!e.writeVarU32(func.varTypes().length()))
        return false;

    for (ValType type : func.varTypes()) {
        if (!e.writeValType(type))
            return false;
    }

    if (func.maybeBody()) {
        if (!EncodeExpr(e, *func.maybeBody()))
            return false;
    } else {
        if (!e.writeExpr(Expr::Nop))
            return false;
    }

    e.finishSection(offset);

    return true;
}

static bool
EncodeCodeSection(Encoder& e, WasmAstModule& module)
{
    if (module.funcs().empty())
        return true;

    if (!e.writeCString(CodeSection))
        return false;

    size_t offset;
    if (!e.startSection(&offset))
        return false;

    if (!e.writeVarU32(module.funcs().length()))
        return false;

    for (WasmAstFunc* func : module.funcs()) {
        if (!EncodeFunc(e, *func))
            return false;
    }

    e.finishSection(offset);
    return true;
}

static UniqueBytecode
AstToBinary(WasmAstModule& module)
{
    UniqueBytecode bytecode = MakeUnique<Bytecode>();
    if (!bytecode)
        return nullptr;

    Encoder e(*bytecode);

    if (!e.writeU32(MagicNumber))
        return nullptr;

    if (!e.writeU32(EncodingVersion))
        return nullptr;

    if (!EncodeSignatureSection(e, module))
        return nullptr;

    if (!EncodeDeclarationSection(e, module))
        return nullptr;

    if (!EncodeImportSection(e, module))
        return nullptr;

    if (!EncodeExportSection(e, module))
        return nullptr;

    if (!EncodeCodeSection(e, module))
        return nullptr;

    if (!e.writeCString(EndSection))
        return nullptr;

    return Move(bytecode);
}

/*****************************************************************************/

UniqueBytecode
wasm::TextToBinary(const char16_t* text, UniqueChars* error)
{
    LifoAlloc lifo(AST_LIFO_DEFAULT_CHUNK_SIZE);
    WasmAstModule* module = TextToAst(text, lifo, error);
    if (!module)
        return nullptr;

    return AstToBinary(*module);
}
